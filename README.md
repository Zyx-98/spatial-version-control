<h1 align="center">Spatial Version Control</h1>
<p align="center">
    A Git-like version control system for geospatial data
</p>

<a name="table-of-contents"></a>

## Table of contents

- [Table of contents](#table-of-contents)
- [Description](#description)
- [Features](#features)
  - [Interactive Map Editor](#interactive-map-editor)
  - [Access Control](#access-control)
  - [Collaboration Features](#collaboration-features)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [Clone the Project](#clone-the-project)
  - [Setup with Docker](#setup-with-docker)
- [Usage](#usage)
  - [Running the Application](#running-the-application)
  - [User Roles](#user-roles)
  - [Working with Branches](#working-with-branches)
  - [Creating Merge Requests](#creating-merge-requests)
  - [Resolving Conflicts](#resolving-conflicts)
    - [Branch-Level Resolution (Recommended)](#branch-level-resolution-recommended)
    - [Merge Request-Level Resolution](#merge-request-level-resolution)
- [API Documentation](#api-documentation)
  - [Authentication](#authentication)
  - [Datasets](#datasets)
  - [Branches](#branches)
  - [Commits](#commits)
  - [Features](#features-1)
  - [Merge Requests](#merge-requests)
- [Tech Stack](#tech-stack)
  - [Backend](#backend)
  - [Frontend](#frontend)
  - [Database Schema](#database-schema)
- [Screenshots](#screenshots)
  - [Datasets](#datasets-1)
  - [Branch detail](#branch-detail)
  - [Commit detail](#commit-detail)
  - [Create commit](#create-commit)
  - [Merge request detail](#merge-request-detail)
  - [Resolve merge conflicts](#resolve-merge-conflicts)
- [TODO](#todo)
- [License](#license)
- [Acknowledgments](#acknowledgments)

<a name="description"></a>

## Description

A comprehensive spatial data version control system built with NestJS and PostgreSQL (PostGIS). This system manages versions of spatial data similar to how Git manages code, with support for branches, commits, merge requests, and conflict resolution.

Designed for **high scalability**, the system uses:
- **PostgreSQL with PostGIS** for efficient spatial indexing
- **TypeORM** for database query optimization
- **Docker** for horizontal scaling
- **Department isolation** for multi-tenancy support

<a name="features"></a>

## Features

- **Multi-Department Support**: Organize users and datasets by departments with complete data isolation
- **Role-Based Access Control**: Admin and Normal User roles with granular permissions
- **Spatial Data Management**: Full support for standard GeoJSON geometry types (Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon)
- **File Format Support**: Import and export GeoJSON and Shapefile formats with GDAL integration
- **Git-Like Version Control**:
  - Create branches from main branch
  - Commit changes with detailed tracking
  - Merge requests (Pull Requests) with visual diff
  - Conflict detection and resolution
  - Fetch functionality to check for conflicts
  - Branch lifecycle management (active/disabled states)
- **Permissions System**:
  - Admins can create datasets and edit main branch directly
  - Normal users can view, create branches, edit their branches, and create merge requests
  - Only admins can approve/reject merge requests in their department
  - Branch ownership validation
  - Prevention of duplicate merge requests

### Interactive Map Editor
- **Drawing Tools**: Create points, lines, and polygons directly on the map
- **Geometry Support**: Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon
- **Edit Mode**: Move and reshape existing features
- **Property Management**: Add and edit custom properties for each feature
- **Real-time Visualization**: See changes immediately on the map
- **Visual Change Tracking**: Color-coded indicators for added, modified, and deleted features

### Access Control
- **Role-Based Permissions**: Admin and User roles with different capabilities
- **Branch Ownership**: Users can only edit branches they created
- **Protected Main Branch**: Only admins can modify the main branch
- **Disabled Branch Protection**: Merged branches are automatically disabled
- **Merge Request Workflow**: Users create, admins approve
- **Permission Validation**: Backend enforces all permission checks

### Collaboration Features
- **Department Isolation**: Each department has isolated datasets for multi-tenancy
- **Conflict Detection**: Automatic detection of geometry and property conflicts
- **Git-like Visual Diff**:
  - Side-by-side map comparison with synchronized navigation
  - Property-level diff with git-style `---/+++` format
  - Coordinate-level geometry diff with line numbers
  - Diff statistics (additions, deletions)
  - Color-coded changes (red for removed, green for added)
- **Branch-Level Conflict Resolution**:
  - Resolve conflicts directly from branch view via "Fetch Main"
  - Resolution commits track all conflict decisions
  - Prevents commits when unresolved conflicts exist
  - Timestamp-based staleness detection
- **Change Statistics**: Detailed breakdown of additions, modifications, and deletions
- **Merge Request Prevention**: Prevents duplicate merge requests from the same branch
- **Interactive Highlighting**: Hover over changes to highlight on map
- **ACID Compliance**: All critical operations wrapped in database transactions


<a name="installation"></a>

## Installation

<a name="requirements"></a>

### Requirements

- Docker 20.10+
- Docker Compose 2.0+

### Clone the Project

```bash
git clone https://github.com/yourusername/spatial-version-control.git
cd spatial-version-control
```

### Setup with Docker

Docker installation is the fastest way to get started. All services (frontend, backend, and database) will be set up automatically.

1. **Create environment file:**
```bash
# Create .env file in the root directory
cat > .env << EOF
VITE_API_BASE_URL=http://localhost:3000/api
EOF
```

2. **Start all services:**
```bash
docker-compose up -d
```

3. **Wait for services to be ready** (first run may take a few minutes):
```bash
docker-compose logs -f
```

4. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Database: localhost:5432

5. **Initialize the database** (first time only):
```bash
# Run migrations
docker-compose exec server npm run migration:run

# Run seed (creates demo data)
docker-compose exec server npm run db:seed
```

6. **Default Login Credentials** (after seeding):
```
Admin:
  username: admin
  password: secret123

User:
  username: user
  password: secret123
```

<a name="usage"></a>

## Usage

### Running the Application

After installation, simply start the Docker services:

```bash
docker-compose up -d
```

Then open your browser and navigate to `http://localhost:5173`

**Stop services:**
```bash
docker-compose down
```

**View logs:**
```bash
docker-compose logs -f [service-name]
```

### User Roles

**Admin:**
- Create and manage datasets
- Approve/reject merge requests
- Edit main branch directly
- Manage all branches and features
- View all department data

**User:**
- Create working branches
- Edit their own branches
- Create and submit merge requests
- View all datasets in their department
- Cannot edit main branch or other users' branches

### Working with Branches

1. **Create a Branch:**
   - Navigate to a dataset
   - Click "Create Branch" button
   - Enter a branch name (e.g., `feature/update-roads`)
   - New branch will be created from current main branch state

2. **Edit Features:**
   - Open the branch detail view
   - Click "Create Commit" to open the map editor
   - Use drawing tools to add features (Point, Line, Polygon, etc.)
   - Click existing features to edit properties
   - Enable Edit Mode to move/reshape features
   - Click "Commit Changes" with a commit message

3. **View Changes:**
   - Click on any commit to view detailed changes
   - See visual diff with color-coded features
   - Review property changes with git-like diff format
   - Interactive map showing all modifications

### Creating Merge Requests

1. Navigate to your branch detail page
2. Click "Create Merge Request" button (only available if no active MR exists)
3. The system will automatically:
   - Compare your branch with main
   - Detect any conflicts
   - Show detailed change summary
4. Add a descriptive title and description
5. Submit for admin review

**Automatic Features:**
- Change comparison loads automatically
- Visual side-by-side map comparison
- Property diff with highlighting
- Conflict detection

### Resolving Conflicts

Conflicts can be resolved at two levels:

#### Branch-Level Resolution (Recommended)
1. **Fetch Main Branch:**
   - Navigate to your branch detail page
   - Click "Fetch Main" button
   - System detects conflicts with main branch

2. **Review Conflicts:**
   - Git-style diff view shows property changes (`---/+++` format)
   - Side-by-side map comparison for geometry changes
   - Coordinate-level diff with line numbers

3. **Resolve Each Conflict:**
   - **Use Main**: Keep the main branch version
   - **Use Branch**: Keep your branch version
   - Click "Save Resolutions"

4. **Continue Working:**
   - Resolution creates a special commit tracking decisions
   - You can now create new commits
   - Conflicts won't reappear unless main changes again

#### Merge Request-Level Resolution
1. **View Conflicts:**
   - Navigate to your merge request
   - Click "View Conflicts" button
   - Same git-style diff view as branch-level

2. **Resolution Options:**
   - **Use Main**: Keep the main branch version
   - **Use Branch**: Keep your branch version
   - Resolve each conflict individually

3. **Save Resolutions:**
   - Click "Save Resolutions" after resolving all conflicts
   - Creates resolution commit on source branch
   - Merge request is updated
   - Admin can now approve the merge

**Note:** The system uses timestamp-based staleness detection. If the main branch is updated after you resolve conflicts, you'll need to resolve again.


<a name="api-documentation"></a>

## API Documentation

The API follows RESTful principles with the following main endpoints:

### Authentication
```
POST /api/auth/login - Login with credentials
POST /api/auth/register - Register new user (Admin only)
GET /api/auth/profile - Get current user profile
```

### Datasets
```
POST /api/datasets - Create dataset (Admin only)
GET /api/datasets - List all datasets in user's department
GET /api/datasets/:id - Get dataset details
DELETE /api/datasets/:id - Delete dataset (Admin only)
```

### Branches
```
POST /api/branches - Create new branch
GET /api/branches/:id - Get branch details
GET /api/branches/:id/with-permissions - Get branch with permission flags
DELETE /api/branches/:id - Delete branch (Creator or Admin)
POST /api/branches/:id/fetch-main - Fetch main branch updates and check conflicts
```

### Commits
```
POST /api/commits - Create commit with features
GET /api/commits/branch/:branchId - Get all commits for a branch
GET /api/commits/:id - Get commit details
GET /api/commits/:id/changes - Get commit changes with visual diff
POST /api/commits/compare - Compare two branches
```

### Features
```
GET /api/features/branch/:branchId/latest - Get latest features for a branch
GET /api/features/:featureId/history - Get feature history across commits
```

### Merge Requests
```
POST /api/merge-requests - Create merge request
GET /api/merge-requests - List all merge requests
GET /api/merge-requests/:id - Get merge request details
POST /api/merge-requests/:id/review - Review merge request (Admin only)
POST /api/merge-requests/:id/resolve-conflicts - Resolve conflicts
GET /api/merge-requests/:id/conflicts - Get conflict details
```

**Response Format:**
All endpoints return JSON with consistent error handling:
```json
{
  "statusCode": 200,
  "data": { /* response data */ }
}
```

Error responses:
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

<a name="tech-stack"></a>

## Tech Stack

### Backend
- **Framework**: NestJS (Node.js) - Modular architecture for scalability
- **Database**: PostgreSQL 14+ with PostGIS 3.0+ extension
- **ORM**: TypeORM - Optimized queries with spatial indexing
- **Authentication**: JWT (JSON Web Tokens) with bcrypt
- **Validation**: class-validator, class-transformer
- **API Documentation**: Swagger/OpenAPI (auto-generated)

### Frontend
- **Framework**: Vue.js 3 (Composition API with TypeScript)
- **State Management**: Pinia stores
- **Routing**: Vue Router 4
- **HTTP Client**: Axios with interceptors
- **Map Library**: Leaflet 1.9+ with Leaflet.draw
- **Styling**: Tailwind CSS 3
- **Build Tool**: Vite 4 - Fast HMR and builds
- **Date Handling**: date-fns

### Database Schema

**Key Tables:**
- `departments` - Multi-tenant organization units
- `users` - User authentication with role-based access
- `datasets` - Geospatial dataset containers
- `branches` - Version control branches with head commit tracking
- `commits` - Commit history with parent relationships
- `spatial_features` - PostGIS geometry storage with operations (CREATE/UPDATE/DELETE)
- `merge_requests` - Pull request workflow with conflict tracking

**Spatial Indexing:**
- GiST indexes on geometry columns for fast spatial queries
- Composite indexes on common query patterns
- Optimized for concurrent read/write operations

**Scalability Features:**
- Connection pooling with TypeORM
- Prepared statements for security and performance
- Transaction support for data integrity
- Foreign key constraints with cascading options

<a name="screenshots"></a>

## Screenshots

### Datasets
![datasets](/screenshots/dataset_screenshot.png)

### Branch detail
![branch_detail](/screenshots/branch_detail_screenshot.png)

### Commit detail
![commit_detail](/screenshots/commit_view_screenshot.png)

### Create commit
![create_commit](/screenshots/create_commit_screenshot.png)

### Merge request detail
![merge_request_detail](/screenshots/merge_request_detail_screenshot.png)

### Resolve merge conflicts
![resolve_merge_conflicts](/screenshots/resolve_merge_conflict_screenshot.png)

<a name="todo"></a>

## TODO

- [x] **Visual Diff System**
  - [x] Side-by-side geometry comparison viewer
  - [x] Visual diff for geometry changes
  - [x] Property-level diff with git-like format
  - [x] Interactive map highlighting

- [x] **Branch Management**
  - [x] Branch comparison view
  - [x] Branch lifecycle management (disabled after merge)
  - [x] Permission-based editing
  - [ ] Stale branch detection and cleanup

- [ ] **Enhanced Conflict Resolution**
  - [x] Basic conflict detection and resolution
  - [ ] Manual merge editor
  - [ ] Three-way merge visualization

- [ ] **Collaboration Features**
  - [ ] Comments on merge requests
  - [ ] @mentions and notifications
  - [ ] Activity feed per dataset
  - [ ] Email notifications for merge request events

- [ ] **Advanced Features**
  - [x] GeoJSON import/export
  - [x] Shapefile import/export with GDAL integration
  - [ ] Time-travel feature (view data at specific commit)
  - [ ] Comprehensive audit log

- [ ] **Performance Optimization**
  - [ ] Pagination for large datasets
  - [ ] Virtual scrolling for feature lists
  - [ ] Database query caching
  - [ ] Lazy loading for map features
  - [ ] WebSocket for real-time updates

- [ ] **Testing**
  - [ ] Unit tests for backend services
  - [ ] Integration tests for API endpoints
  - [ ] E2E tests for critical workflows
  - [ ] Performance benchmarking
  - [ ] Load testing for scalability validation

- [ ] **Documentation**
  - [ ] API documentation with examples
  - [ ] Architecture decision records (ADRs)
  - [ ] Deployment guides for different platforms

- [ ] **Deployment & DevOps**
  - [ ] Kubernetes manifests with autoscaling
  - [ ] CI/CD pipeline (GitHub Actions)
  - [ ] Production configuration guide
  - [ ] Monitoring and logging setup
  - [ ] Backup and recovery procedures

<a name="license"></a>

## License

This project is licensed with the [MIT license](LICENSE).

---

<a name="acknowledgments"></a>

## Acknowledgments

- [Leaflet](https://leafletjs.com/) - Interactive maps
- [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw) - Drawing tools
- [PostGIS](https://postgis.net/) - Spatial database extension
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Vue.js](https://vuejs.org/) - Progressive JavaScript framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
