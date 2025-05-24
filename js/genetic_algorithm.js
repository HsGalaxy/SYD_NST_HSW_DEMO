// RRT* Algorithm and supporting map initialization
let gaMap; // For displaying RRT* progress on a smaller map (window.optimizationMap)

// Note: Genetic Algorithm specific variables and functions have been removed.

function initGAMap() {
    if (gaMap) { // If map already exists, just invalidate size (e.g., if tab was re-opened)
        setTimeout(() => gaMap.invalidateSize(), 0);
        return;
    }
    try {
        gaMap = L.map('map-optimization').setView([30.5, 114.3], 5); // Default view
        window.optimizationMap = gaMap; // Expose gaMap as window.optimizationMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(gaMap);
        console.log("GA Map Initialized, window.optimizationMap set.");
    } catch (e) {
        console.error("Error initializing GA map:", e);
        const mapDiv = document.getElementById('map-optimization');
        if (mapDiv) mapDiv.innerHTML = "<p style='color:red; padding:10px;'>GA Map Load Failed: " + e.message + "</p>";
    }
}

// --- Genetic Algorithm specific functions and variables have been removed ---
// The RRTStar class below is independent and used by the main application.

class RRTStar {
    constructor(start, goal, constraints, bounds, options = {}) {
        this.start = start;
        this.goal = goal;
        this.constraints = constraints;
        this.bounds = bounds;
        this.options = {
            maxIterations: options.maxIterations || 1000, // Default, ideally from UI
            stepSize: options.stepSize || 0.02,         // Reduced default stepSize
            goalSampleRate: options.goalSampleRate || 0.1, // Default, ideally from UI
            maxDistance: options.maxDistance || 0.01,      // Max distance to consider goal reached, adjust with stepSize
            rewireRadius: options.rewireRadius || 0.05,     // Rewire radius, adjust with stepSize
            ...options
        };

        this.vertices = [start]; // Array of {lat, lng} points
        this.parents = [null];   // Index of parent vertex for each vertex
        this.costs = [0];        // Cost from start to each vertex
        // this.vertexMap = new Map(); // For quick lookup of nearby vertices - Not currently used, can be removed or implemented later
    }

    // Calculate distance between two points
    distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.lat - p1.lat, 2) + Math.pow(p2.lng - p1.lng, 2));
    }

    // Check if a point is in collision with any constraint
    isCollision(point) {
        for (const constraint of this.constraints) {
            if (constraint.type === 'ocean_absolute_repulsor' && constraint.geojson && constraint.geojson.geometry) {
                const geom = constraint.geojson.geometry;
                let pointInOcean = false;
                if (geom.type === 'Polygon') {
                    if (this._isPointInSinglePolygon(point, geom.coordinates)) pointInOcean = true;
                } else if (geom.type === 'MultiPolygon') {
                    for (const polyCoords of geom.coordinates) {
                        if (this._isPointInSinglePolygon(point, polyCoords)) {
                            pointInOcean = true;
                            break;
                        }
                    }
                }
                if (pointInOcean) {
                    console.log(`RRT* Collision: Point ${JSON.stringify(point)} is INSIDE ocean: ${constraint.geojson.properties?.name || 'Unnamed Ocean'}`);
                    return true;
                }
            }
            // Add checks for other "absolute_barrier" types if necessary
        }
        return false;
    }

    // Helper: Check if a point is inside a single polygon defined by its rings
    // A polygon is an array of rings. The first ring is the exterior, subsequent are holes.
    // For simplicity, this check only considers the exterior ring.
    // A more robust check would use a point-in-polygon library or handle holes.
    _isPointInSinglePolygon(point, rings) {
        if (!rings || rings.length === 0) return false;
        const exteriorRing = rings[0]; // Assuming first ring is the exterior
        let inside = false;
        for (let i = 0, j = exteriorRing.length - 1; i < exteriorRing.length; j = i++) {
            const xi = exteriorRing[i][0], yi = exteriorRing[i][1]; // GeoJSON: [lng, lat]
            const xj = exteriorRing[j][0], yj = exteriorRing[j][1];
            
            // Ray casting algorithm
            const intersect = ((yi > point.lat) !== (yj > point.lat))
                && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        // TODO: Add logic here to check if the point is inside any of the hole rings.
        // If it's inside a hole, it's not in the polygon.
        // For now, this simplified version might incorrectly report points in holes as "in polygon".
        return inside;
    }
    
    // Renamed from isPointInPolygon to avoid confusion with the new _isPointInSinglePolygon
    // This old version was directly used by RRTStar.isCollision before this refactor.
    // It's kept here for reference or if direct ring access is needed elsewhere, but should be deprecated.
    _isPointInRing(point, ring) { // Expects a single ring [lng, lat]
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > point.lat) !== (yj > point.lat))
                && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }


    // Get random point within bounds
    getRandomPoint() {
        if (Math.random() < this.options.goalSampleRate) {
            return this.goal;
        }
        return {
            lat: this.bounds.minLat + Math.random() * (this.bounds.maxLat - this.bounds.minLat),
            lng: this.bounds.minLng + Math.random() * (this.bounds.maxLng - this.bounds.minLng)
        };
    }

    // Find nearest vertex to a point
    findNearest(point) {
        let minDist = Infinity;
        let nearest = 0;
        
        for (let i = 0; i < this.vertices.length; i++) {
            const dist = this.distance(point, this.vertices[i]);
            if (dist < minDist) {
                minDist = dist;
                nearest = i;
            }
        }
        return nearest;
    }

    // Calculate cost of a path segment considering constraints
    calculateSegmentCost(p1, p2) {
        let cost = this.distance(p1, p2);
        
        // Add penalty for crossing constraint areas (non-absolute barriers)
        for (const constraint of this.constraints) {
            // Skip absolute barriers for cost calculation if they are handled by isSegmentInCollision
            if (constraint.type === 'ocean_absolute_repulsor') continue;

            if (constraint.geojson && constraint.geojson.geometry) {
                const geom = constraint.geojson.geometry;
                let intersects = false;
                if (geom.type === 'Polygon') {
                    if (this._segmentIntersectsSinglePolygon(p1, p2, geom.coordinates)) intersects = true;
                } else if (geom.type === 'MultiPolygon') {
                    for (const polyCoords of geom.coordinates) {
                        if (this._segmentIntersectsSinglePolygon(p1, p2, polyCoords)) {
                            intersects = true;
                            break;
                        }
                    }
                }
                if (intersects) {
                    cost += Math.abs(constraint.weight) * this.distance(p1, p2);
                }
            }
        }
        return cost;
    }

    // Helper: Check if a line segment intersects a single polygon defined by its rings
    _segmentIntersectsSinglePolygon(p1, p2, rings) {
        if (!rings || rings.length === 0) return false;
        const exteriorRing = rings[0]; // Assuming first ring is the exterior
        for (let i = 0, j = exteriorRing.length - 1; i < exteriorRing.length; j = i++) {
            const v1 = { lat: exteriorRing[i][1], lng: exteriorRing[i][0] }; // Convert GeoJSON [lng, lat] to {lat, lng}
            const v2 = { lat: exteriorRing[j][1], lng: exteriorRing[j][0] };
            if (this.lineIntersectsLine(p1, p2, v1, v2)) {
                return true;
            }
        }
        // TODO: Add checks for intersection with hole rings if necessary.
        return false;
    }

    // Renamed from segmentIntersectsPolygon
    _segmentIntersectsRing(p1, p2, ring) { // Expects a single ring of {lat,lng} points or [lng,lat]
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            // Ensure points are in {lat, lng} format for lineIntersectsLine
            const v1 = Array.isArray(ring[i]) ? { lat: ring[i][1], lng: ring[i][0] } : ring[i];
            const v2 = Array.isArray(ring[j]) ? { lat: ring[j][1], lng: ring[j][0] } : ring[j];
            if (this.lineIntersectsLine(p1, p2, v1, v2)) {
                return true;
            }
        }
        return false;
    }


    // Check if two line segments intersect
    lineIntersectsLine(p1, p2, p3, p4) {
        const ccw = (A, B, C) => {
            return (C.lat - A.lat) * (B.lng - A.lng) > (B.lat - A.lat) * (C.lng - A.lng);
        };
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    // Steer towards a point
    steer(from, to) {
        const dist = this.distance(from, to);
        if (dist <= this.options.stepSize) {
            return to;
        }
        const ratio = this.options.stepSize / dist;
        return {
            lat: from.lat + (to.lat - from.lat) * ratio,
            lng: from.lng + (to.lng - from.lng) * ratio
        };
    }

    // Find nearby vertices within radius
    findNearbyVertices(point, radius) {
        const nearby = [];
        for (let i = 0; i < this.vertices.length; i++) {
            if (this.distance(point, this.vertices[i]) <= radius) {
                nearby.push(i);
            }
        }
        return nearby;
    }

    // Rewire the tree
    rewire(newVertex, nearbyVertices) {
        for (const i of nearbyVertices) {
            const newCost = this.costs[newVertex] + this.calculateSegmentCost(this.vertices[newVertex], this.vertices[i]);
            if (newCost < this.costs[i]) {
                this.parents[i] = newVertex;
                this.costs[i] = newCost;
                this.rewire(i, this.findNearbyVertices(this.vertices[i], this.options.rewireRadius));
            }
        }
    }

    // Build the path
    buildPath(goalIndex) {
        const path = [];
        let current = goalIndex;
        while (current !== null) {
            path.unshift(this.vertices[current]);
            current = this.parents[current];
        }
        return path;
    }

    getBestPathToGoalAttempt() {
        if (this.vertices.length === 0) {
            return null;
        }

        let closestNodeIndex = 0;
        let minDistanceToGoal = Infinity;

        for (let i = 0; i < this.vertices.length; i++) {
            const dist = this.distance(this.vertices[i], this.goal);
            if (dist < minDistanceToGoal) {
                minDistanceToGoal = dist;
                closestNodeIndex = i;
            }
        }
        // console.log(`Best effort: Path to node ${closestNodeIndex} which is ${minDistanceToGoal.toFixed(2)} away from goal.`);
        return this.buildPath(closestNodeIndex);
    }

    // Main planning function - performs ONE iteration/extension of the RRT* tree
    plan() {
        // Get random point
        const randomPoint = this.getRandomPoint();
        
        // Find nearest vertex
        const nearestIndex = this.findNearest(randomPoint);
        const nearestVertex = this.vertices[nearestIndex];
        
        // Steer towards random point
        const newPoint = this.steer(nearestVertex, randomPoint);
        
        // Check for collision for the newPoint itself
        if (this.isCollision(newPoint)) {
            console.log(`RRT* plan: newPoint ${JSON.stringify(newPoint)} rejected by isCollision.`);
            return null; // Collision at the new point, cannot extend here this iteration
        }

        // More robust collision check: check if path from nearestVertex to newPoint is clear
        // This requires a line-of-sight or segment collision check function
        // For now, we assume steer() gives a point that, if not in collision itself, the segment is "probably" okay
        // or that isCollision checks are sufficient for the environment.
        // A proper RRT* would check the segment from nearestVertex to newPoint for collisions.

        // Find nearby vertices to the newPoint (potential parents and children for rewiring)
        const nearbyIndices = this.findNearbyVertices(newPoint, this.options.rewireRadius);

        // Find the best parent for newPoint from nearbyVertices (including nearestIndex initially)
        let bestParentIndex = -1; // Initialize to an invalid index
        let minCostToNewPoint = Infinity;
        
        // Consider nearestVertex as an initial candidate for parent
        const costViaNearest = this.costs[nearestIndex] + this.calculateSegmentCost(nearestVertex, newPoint);
        if (!this.isSegmentInCollision(nearestVertex, newPoint, `parent_check_nearest (to newP: ${JSON.stringify(newPoint).substring(0,30)})`)) {
            minCostToNewPoint = costViaNearest;
            bestParentIndex = nearestIndex;
        } else {
            // Log moved to isSegmentInCollision
        }

        for (const nearbyIdx of nearbyIndices) {
            // if (nearbyIdx === nearestIndex && bestParentIndex === nearestIndex) continue; // This logic might be too restrictive if nearest was initially in collision
            if (nearbyIdx === nearestIndex) continue;


            const nearbyNode = this.vertices[nearbyIdx];
            const costViaNearby = this.costs[nearbyIdx] + this.calculateSegmentCost(nearbyNode, newPoint);

            if (costViaNearby < minCostToNewPoint) {
                if (!this.isSegmentInCollision(nearbyNode, newPoint, `parent_check_nearby (nearN: ${JSON.stringify(nearbyNode).substring(0,30)} to newP: ${JSON.stringify(newPoint).substring(0,30)})`)) {
                    minCostToNewPoint = costViaNearby;
                    bestParentIndex = nearbyIdx;
                } else {
                    // Log moved to isSegmentInCollision
                }
            }
        }

        if (bestParentIndex === -1) {
            console.log(`RRT* plan: No valid parent found for newPoint ${JSON.stringify(newPoint)}. nearestIndex was ${nearestIndex}.`);
            return null;
        }
        
        // Add new vertex to the tree
        this.vertices.push(newPoint);
        this.parents.push(bestParentIndex);
        this.costs.push(minCostToNewPoint);
        const newVertexIndex = this.vertices.length - 1;

        // Rewire nearby vertices to use newPoint as parent if it provides a shorter path
        for (const nearbyIdx of nearbyIndices) {
            if (nearbyIdx === bestParentIndex) continue;

            const nearbyNode = this.vertices[nearbyIdx];
            // Cost to reach nearbyNode via newPoint
            const costToNearbyViaNewPoint = minCostToNewPoint + this.calculateSegmentCost(newPoint, nearbyNode);

            if (costToNearbyViaNewPoint < this.costs[nearbyIdx]) {
                if (!this.isSegmentInCollision(newPoint, nearbyNode, `rewire_check (newP: ${JSON.stringify(newPoint).substring(0,30)} to nearN: ${JSON.stringify(nearbyNode).substring(0,30)})`)) {
                    this.parents[nearbyIdx] = newVertexIndex;
                    this.costs[nearbyIdx] = costToNearbyViaNewPoint;
                } else {
                    // Log moved to isSegmentInCollision
                }
            }
        }
        
        // Check if goal is reached by this new point
        if (this.distance(newPoint, this.goal) < this.options.maxDistance) {
            return this.buildPath(newVertexIndex); // Path to goal found
        }
        
        return null; // Goal not reached in this iteration
    }

    isSegmentInCollision(p1, p2, context = 'unknown') {
        // Checks against 'ocean_absolute_repulsor' and other potential 'absolute_barrier' types
        for (const constraint of this.constraints) {
            if ((constraint.type === 'ocean_absolute_repulsor' /* || other absolute types */) &&
                constraint.geojson && constraint.geojson.geometry) {
                const geom = constraint.geojson.geometry;
                let segmentInOcean = false;
                if (geom.type === 'Polygon') {
                    if (this._segmentIntersectsSinglePolygon(p1, p2, geom.coordinates)) segmentInOcean = true;
                } else if (geom.type === 'MultiPolygon') {
                    for (const polyCoords of geom.coordinates) {
                        if (this._segmentIntersectsSinglePolygon(p1, p2, polyCoords)) {
                             segmentInOcean = true;
                             break;
                        }
                    }
                }
                if (segmentInOcean) {
                    console.log(`RRT* Segment Collision (${context}): Segment from ${JSON.stringify(p1)} to ${JSON.stringify(p2)} intersects ocean: ${constraint.geojson.properties?.name || 'Unnamed Ocean'}`);
                    return true;
                }
            }
        }
        return false;
    }
}

// Export the RRTStar class
window.RRTStar = RRTStar;
