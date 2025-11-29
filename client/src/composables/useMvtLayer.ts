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
      console.log('MVT tile URL template:', tileUrl);
      console.log('Adding source with ID:', sourceId);

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

      console.log(`Added MVT layers for source: ${sourceId}`);

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

        // Add properties
        if (props.properties && typeof props.properties === 'object') {
          const customProps = props.properties;
          const propEntries = Object.entries(customProps).slice(0, 5); // Limit to 5 properties

          if (propEntries.length > 0) {
            content += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">';
            propEntries.forEach(([key, value]) => {
              content += `
                <div style="font-size: 12px; margin-bottom: 2px;">
                  <strong style="color: #4b5563;">${key}:</strong>
                  <span style="color: #6b7280;">${value}</span>
                </div>
              `;
            });

            if (Object.keys(customProps).length > 5) {
              content += `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">+ ${Object.keys(customProps).length - 5} more properties</div>`;
            }
            content += '</div>';
          }
        }

        content += '</div>';

        popup.setLngLat(coordinates).setHTML(content).addTo(map);
      });
    });
  };

  /**
   * Get center coordinates for a feature (for popup positioning)
   */
  const getFeatureCenter = (feature: any): [number, number] => {
    if (!feature.geometry) return [0, 0];

    const geom = feature.geometry;

    if (geom.type === 'Point') {
      return geom.coordinates as [number, number];
    } else if (geom.type === 'LineString') {
      const coords = geom.coordinates;
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    } else if (geom.type === 'Polygon') {
      const coords = geom.coordinates[0]; // Outer ring
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    }

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

      console.log(`Removed MVT layer: ${sourceId}`);
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

  return {
    loading,
    error,
    addBranchMvtLayer,
    removeMvtLayer,
    fitBranchBounds,
    updateLayerColor,
  };
}
