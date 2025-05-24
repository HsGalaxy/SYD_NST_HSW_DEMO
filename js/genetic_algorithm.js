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
            maxIterations: options.maxIterations || 1000,
            stepSize: options.stepSize || 0.1,
            goalSampleRate: options.goalSampleRate || 0.1,
            maxDistance: options.maxDistance || 0.5,
            rewireRadius: options.rewireRadius || 0.5,
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
            if (constraint.type === 'ocean_absolute_repulsor') {
                // Check if point is in ocean
                if (this.isPointInPolygon(point, constraint.geojson.geometry.coordinates[0])) {
                    return true;
                }
            }
        }
        return false;
    }

    // Check if a point is inside a polygon
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            
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
        
        // Add penalty for crossing constraint areas
        for (const constraint of this.constraints) {
            if (this.segmentIntersectsPolygon(p1, p2, constraint.geojson.geometry.coordinates[0])) {
                cost += Math.abs(constraint.weight) * this.distance(p1, p2);
            }
        }
        
        return cost;
    }

    // Check if a line segment intersects a polygon
    segmentIntersectsPolygon(p1, p2, polygon) {
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            
            if (this.lineIntersectsLine(p1, p2, {lat: yi, lng: xi}, {lat: yj, lng: xj})) {
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
        let bestParentIndex = nearestIndex;
        let minCostToNewPoint = this.costs[nearestIndex] + this.calculateSegmentCost(nearestVertex, newPoint);

        for (const nearbyIdx of nearbyIndices) {
            const nearbyNode = this.vertices[nearbyIdx];
            // Check if path from nearbyNode to newPoint is collision-free
            // (Simplified: assuming if newPoint is not in collision, segment is okay for now)
            const costViaNearby = this.costs[nearbyIdx] + this.calculateSegmentCost(nearbyNode, newPoint);
            if (costViaNearby < minCostToNewPoint) {
                // Add a segment collision check here if needed: if (isSegmentCollisionFree(nearbyNode, newPoint))
                minCostToNewPoint = costViaNearby;
                bestParentIndex = nearbyIdx;
            }
        }
        
        // Add new vertex to the tree
        this.vertices.push(newPoint);
        this.parents.push(bestParentIndex);
        this.costs.push(minCostToNewPoint);
        const newVertexIndex = this.vertices.length - 1;

        // Rewire nearby vertices to use newPoint as parent if it provides a shorter path
        for (const nearbyIdx of nearbyIndices) {
            if (nearbyIdx === bestParentIndex) continue; // Already considered

            const nearbyNode = this.vertices[nearbyIdx];
            const costViaNewPoint = minCostToNewPoint + this.calculateSegmentCost(newPoint, nearbyNode);

            if (costViaNewPoint < this.costs[nearbyIdx]) {
                 // Add a segment collision check here if needed: if (isSegmentCollisionFree(newPoint, nearbyNode))
                this.parents[nearbyIdx] = newVertexIndex;
                this.costs[nearbyIdx] = costViaNewPoint;
            }
        }
        
        // Check if goal is reached by this new point
        if (this.distance(newPoint, this.goal) < this.options.maxDistance) {
            return this.buildPath(newVertexIndex); // Path to goal found
        }
        
        return null; // Goal not reached in this iteration
    }
}

// Export the RRTStar class
window.RRTStar = RRTStar;
