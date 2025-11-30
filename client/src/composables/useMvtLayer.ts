import { ref } from 'vue';
import maplibregl from 'maplibre-gl';

export interface MvtLayerOptions {
  sourceId: string;
  color: string;
  layerName?: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

/**
 * Composable for adding MVT (Mapbox Vector Tile) layers to maps
 * This significantly improves performance for large datasets
 */
export function useMvtLayer() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Add MVT layer to a map for a specific branch
   */
  const addBranchMvtLayer = (
    map: maplibregl.Map,
    branchId: string,
    options: MvtLayerOptions
  ) => {
    const { sourceId, color, layerName = 'features' } = options;

    if (!map || !map.loaded()) {
      console.warn('Map not loaded yet');
      return;
    }

    try {
      // Get auth token for tile requests
      const token = localStorage.getItem('token');

      // Add vector tile source
      const tileUrl = `${API_BASE_URL}/branches/${branchId}/tiles/{z}/{x}/{y}.mvt?token=${token}`;

      map.addSource(sourceId, {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 22,
      });

      // Add fill layer for polygons
      map.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        'source-layer': layerName,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': color,
          'fill-opacity': 0.4,
        },
      });

      // Add line layer for LineStrings and Polygon outlines
      map.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        'source-layer': layerName,
        filter: ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'Polygon']
        ],
        paint: {
          'line-color': color,
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });

      // Add circle layer for points
      map.addLayer({
        id: `${sourceId}-point`,
        type: 'circle',
        source: sourceId,
        'source-layer': layerName,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            8, // Larger when hovered
            6, // Normal size
          ],
          'circle-color': color,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.5, // Thicker when hovered
            1.5, // Normal width
          ],
        },
      });

      // Add interaction handlers
      setupInteractions(map, sourceId);
    } catch (err) {
      console.error('Error adding MVT layer:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
    }
  };

  /**
   * Setup hover and click interactions for MVT layers
   */
  const setupInteractions = (map: maplibregl.Map, sourceId: string) => {
    const layerIds = [
      `${sourceId}-fill`,
      `${sourceId}-line`,
      `${sourceId}-point`,
    ];

    // Create popup instance
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '400px',
    });

    // Track currently hovered feature
    let hoveredFeatureId: string | number | null = null;

    // Change cursor on hover and highlight feature
    layerIds.forEach((layerId) => {
      const layer = map.getLayer(layerId);
      if (!layer) {
        console.warn(`[useMvtLayer] Layer ${layerId} not found`);
        return;
      }

      map.on('mouseenter', layerId, (e) => {
        map.getCanvas().style.cursor = 'pointer';

        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          hoveredFeatureId = feature.id || feature.properties?.feature_id;

          if (hoveredFeatureId) {
            map.setFeatureState(
              { source: sourceId, sourceLayer: 'features', id: hoveredFeatureId },
              { hover: true }
            );
          }
        }
      });

      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';

        if (hoveredFeatureId) {
          map.setFeatureState(
            { source: sourceId, sourceLayer: 'features', id: hoveredFeatureId },
            { hover: false }
          );
          hoveredFeatureId = null;
        }
      });

      // Show popup on click
      map.on('click', layerId, (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const coordinates = getFeatureCenter(feature);

        // Build popup content
        const props = feature.properties || {};
        const geometryType = props.geometry_type || feature.geometry?.type || 'Unknown';

        let content = `
          <div style="font-family: sans-serif; padding: 8px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
              ${props.feature_id || 'Feature'}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              <strong>Type:</strong> ${geometryType}
            </div>
        `;

        // Add custom properties (filter out internal properties)
        const systemProps = ['feature_id', 'geometry_type', 'operation', 'commit_id'];
        const propEntries = Object.entries(props)
          .filter(([key]) => !systemProps.includes(key))
          .slice(0, 10); // Show up to 10 properties

        if (propEntries.length > 0) {
          content += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">';
          propEntries.forEach(([key, value]) => {
            // Handle nested properties object if it exists
            if (key === 'properties' && typeof value === 'object' && value !== null) {
              Object.entries(value).slice(0, 5).forEach(([nestedKey, nestedValue]) => {
                content += `
                  <div style="font-size: 12px; margin-bottom: 2px;">
                    <strong style="color: #4b5563;">${nestedKey}:</strong>
                    <span style="color: #6b7280;">${nestedValue}</span>
                  </div>
                `;
              });
            } else {
              content += `
                <div style="font-size: 12px; margin-bottom: 2px;">
                  <strong style="color: #4b5563;">${key}:</strong>
                  <span style="color: #6b7280;">${value}</span>
                </div>
              `;
            }
          });

          const totalProps = Object.keys(props).filter(k => !systemProps.includes(k)).length;
          if (totalProps > 10) {
            content += `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">+ ${totalProps - 10} more properties</div>`;
          }
          content += '</div>';
        }

        content += '</div>';

        try {
          popup.setLngLat(coordinates).setHTML(content).addTo(map);
        } catch (err) {
          console.error('[useMvtLayer] Error creating popup:', err);
        }
      });
    });
  };

  /**
   * Get center coordinates for a feature (for popup positioning)
   */
  const getFeatureCenter = (feature: any): [number, number] => {
    if (!feature.geometry) {
      console.warn('[useMvtLayer] No geometry for feature');
      return [0, 0];
    }

    const geom = feature.geometry;

    if (geom.type === 'Point') {
      return geom.coordinates as [number, number];
    } else if (geom.type === 'MultiPoint') {
      // Use first point
      return geom.coordinates[0] as [number, number];
    } else if (geom.type === 'LineString') {
      const coords = geom.coordinates;
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    } else if (geom.type === 'MultiLineString') {
      // Use midpoint of first line
      const coords = geom.coordinates[0];
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    } else if (geom.type === 'Polygon') {
      const coords = geom.coordinates[0]; // Outer ring
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    } else if (geom.type === 'MultiPolygon') {
      // Use midpoint of first polygon's outer ring
      const coords = geom.coordinates[0][0]; // First polygon, outer ring
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    }

    console.warn('[useMvtLayer] Unknown geometry type:', geom.type);
    return [0, 0];
  };

  /**
   * Remove MVT layer from map
   */
  const removeMvtLayer = (map: maplibregl.Map, sourceId: string) => {
    if (!map) return;

    try {
      // Remove layers
      [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-point`].forEach(
        (layerId) => {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
        }
      );

      // Remove source
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (err) {
      console.error('Error removing MVT layer:', err);
    }
  };

  /**
   * Fetch bounds for a branch and fit map to them
   */
  const fitBranchBounds = async (
    map: maplibregl.Map,
    branchId: string
  ): Promise<void> => {
    try {
      loading.value = true;

      // Fetch bounds from API
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/branches/${branchId}/bounds`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch bounds');
      }

      const data = await response.json();
      const bounds = data.bounds;

      if (bounds && bounds.length === 4) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]], // southwest
            [bounds[2], bounds[3]], // northeast
          ],
          { padding: 50 }
        );
      }
    } catch (err) {
      console.error('Error fitting bounds:', err);
      error.value = err instanceof Error ? err.message : 'Failed to fetch bounds';
    } finally {
      loading.value = false;
    }
  };

  /**
   * Update MVT layer color (useful for highlighting)
   */
  const updateLayerColor = (
    map: maplibregl.Map,
    sourceId: string,
    color: string
  ) => {
    if (!map) return;

    try {
      if (map.getLayer(`${sourceId}-fill`)) {
        map.setPaintProperty(`${sourceId}-fill`, 'fill-color', color);
      }
      if (map.getLayer(`${sourceId}-line`)) {
        map.setPaintProperty(`${sourceId}-line`, 'line-color', color);
      }
      if (map.getLayer(`${sourceId}-point`)) {
        map.setPaintProperty(`${sourceId}-point`, 'circle-color', color);
      }
    } catch (err) {
      console.error('Error updating layer color:', err);
    }
  };

  const addDiffMvtLayer = (
    map: maplibregl.Map,
    sourceBranchId: string,
    targetBranchId: string,
    options: { sourceId: string; layerName?: string }
  ) => {
    const { sourceId, layerName = 'diff' } = options;

    if (!map || !map.loaded()) {
      console.warn('Map not loaded yet');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      const tileUrl = `${API_BASE_URL}/branches/${sourceBranchId}/diff/${targetBranchId}/tiles/{z}/{x}/{y}.mvt?token=${token}`;

      map.addSource(sourceId, {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 22,
      });

      const colorExpression = [
        'match',
        ['get', 'change_type'],
        'added', '#10b981',    // Green for added
        'modified', '#3b82f6', // Blue for modified
        'deleted', '#ef4444',  // Red for deleted
        '#6b7280'              // Gray fallback
      ];

      map.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        'source-layer': layerName,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': colorExpression as any,
          'fill-opacity': 0.4,
        },
      });

      map.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        'source-layer': layerName,
        filter: ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'Polygon']
        ],
        paint: {
          'line-color': colorExpression as any,
          'line-width': [
            'match',
            ['get', 'change_type'],
            'deleted', 3,   // Thicker for deleted
            2               // Normal for others
          ],
          'line-opacity': [
            'match',
            ['get', 'change_type'],
            'deleted', 0.6, // More transparent for deleted
            0.8             // Normal opacity
          ],
          'line-dasharray': [
            'match',
            ['get', 'change_type'],
            'deleted', [2, 2], // Dashed for deleted
            [1]                // Solid for others
          ] as any,
        },
      });

      map.addLayer({
        id: `${sourceId}-point`,
        type: 'circle',
        source: sourceId,
        'source-layer': layerName,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': colorExpression as any,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // Add interaction handlers with diff-specific popup
      setupDiffInteractions(map, sourceId);
    } catch (err) {
      console.error('Error adding diff MVT layer:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
    }
  };

  /**
   * Setup interactions for diff MVT layers
   */
  const setupDiffInteractions = (
    map: maplibregl.Map,
    sourceId: string
  ) => {
    const layerIds = [
      `${sourceId}-fill`,
      `${sourceId}-line`,
      `${sourceId}-point`,
    ];

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '400px',
    });

    layerIds.forEach((layerId) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', layerId, (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const coordinates = getFeatureCenter(feature);
        const props = feature.properties || {};

        // Get change type and color
        const changeType = props.change_type || 'unknown';
        const changeLabels: Record<string, string> = {
          added: 'Added',
          modified: 'Modified',
          deleted: 'Deleted',
        };
        const changeColors: Record<string, string> = {
          added: '#10b981',
          modified: '#3b82f6',
          deleted: '#ef4444',
        };

        const label = changeLabels[changeType] || 'Unknown';
        const color = changeColors[changeType] || '#6b7280';

        let content = `
          <div style="font-family: sans-serif; padding: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color};"></div>
              <div style="font-weight: bold; font-size: 14px; color: #1f2937;">${label}</div>
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              <strong>Feature ID:</strong> ${props.feature_id || 'N/A'}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              <strong>Type:</strong> ${props.geometry_type || 'Unknown'}
            </div>
        `;

        // Add custom properties (filter out internal properties)
        const systemProps = ['change_type', 'feature_id', 'geometry_type', 'operation', 'commit_id'];
        const propEntries = Object.entries(props)
          .filter(([key]) => !systemProps.includes(key))
          .slice(0, 10); // Show up to 10 properties

        if (propEntries.length > 0) {
          content += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">';
          propEntries.forEach(([key, value]) => {
            // Handle nested properties object if it exists
            if (key === 'properties' && typeof value === 'object' && value !== null) {
              try {
                const customProps = typeof value === 'string' ? JSON.parse(value) : value;
                Object.entries(customProps).slice(0, 5).forEach(([nestedKey, nestedValue]) => {
                  content += `
                    <div style="font-size: 12px; margin-bottom: 2px;">
                      <strong style="color: #4b5563;">${nestedKey}:</strong>
                      <span style="color: #6b7280;">${nestedValue}</span>
                    </div>
                  `;
                });
              } catch (e) {
                console.error('Error parsing nested properties:', e);
              }
            } else {
              content += `
                <div style="font-size: 12px; margin-bottom: 2px;">
                  <strong style="color: #4b5563;">${key}:</strong>
                  <span style="color: #6b7280;">${value}</span>
                </div>
              `;
            }
          });

          const totalProps = Object.keys(props).filter(k => !systemProps.includes(k)).length;
          if (totalProps > 10) {
            content += `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">+ ${totalProps - 10} more properties</div>`;
          }
          content += '</div>';
        }

        content += '</div>';

        popup.setLngLat(coordinates).setHTML(content).addTo(map);
      });
    });
  };

  return {
    loading,
    error,
    addBranchMvtLayer,
    addDiffMvtLayer,
    removeMvtLayer,
    fitBranchBounds,
    updateLayerColor,
  };
}
