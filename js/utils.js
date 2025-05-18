// Utility functions
function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function getDistance(latlng1, latlng2) { // Haversine distance
    const R = 6371; // Radius of the earth in km
    const dLat = toRadians(latlng2.lat - latlng1.lat);
    const dLon = toRadians(latlng2.lng - latlng1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(latlng1.lat)) * Math.cos(toRadians(latlng2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Line segment intersects polygon check (basic, might need more robust library for complex cases)
// This is a placeholder, you'd typically use a geometry library like Turf.js for robustness
function lineIntersectsPolygon(p1, p2, polygon) {
    // Simplified check: does midpoint of segment lie in polygon?
    // For a real implementation, use robust line-polygon intersection algorithm
    const midpoint = { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
    return isPointInPolygon(midpoint, polygon.getLatLngs()[0]); // Assumes simple polygon
}

function isPointInPolygon(point, polygonLatLngs) {
    let inside = false;
    for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
        const xi = polygonLatLngs[i].lng, yi = polygonLatLngs[i].lat;
        const xj = polygonLatLngs[j].lng, yj = polygonLatLngs[j].lat;

        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Deep clone helper
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
