let annotationMap, drawControl, drawnItems, startMarker, endMarker;
const annotations = []; // Store {layer: L.Layer, type: string, weight: number, color: string}

function initAnnotationMap() {
    annotationMap = L.map('map-annotation').setView([30.5, 114.3], 5); // Centered on China
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(annotationMap);

    drawnItems = new L.FeatureGroup();
    annotationMap.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: true,
            polyline: true,
            rectangle: true,
            circle: false,
            marker: true,
            circlemarker: false
        }
    });
    annotationMap.addControl(drawControl);

    annotationMap.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        const typeSelect = document.getElementById('annotation-type');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        const annotationType = selectedOption.value;
        const weight = parseFloat(selectedOption.dataset.weight);
        const color = selectedOption.dataset.color;

        layer.setStyle({ color: color, fillColor: color, weight: 2, fillOpacity: 0.4 });
        drawnItems.addLayer(layer);
        const readableType = selectedOption.textContent.split('(')[0].trim(); // Get "Urban Area" from "Urban Area (Attractor)"
        layer.bindTooltip(readableType, { permanent: false, direction: 'top' });
        annotations.push({ layer: layer, type: annotationType, weight: weight, geojson: layer.toGeoJSON(), readableType: readableType });
        console.log("Annotation added:", annotations[annotations.length-1]);
    });

    document.getElementById('set-start-point').addEventListener('click', () => setPointMode('start'));
    document.getElementById('set-end-point').addEventListener('click', () => setPointMode('end'));
    document.getElementById('random-annotate').addEventListener('click', randomlyAnnotate);
}

function randomlyAnnotate() {
    // Clear existing annotations and markers
    drawnItems.clearLayers();
    annotations.length = 0; // Clear the array
    if (startMarker) {
        annotationMap.removeLayer(startMarker);
        startMarker = null;
        document.getElementById('start-point-coords').textContent = 'Start: Not Set';
    }
    if (endMarker) {
        annotationMap.removeLayer(endMarker);
        endMarker = null;
        document.getElementById('end-point-coords').textContent = 'End: Not Set';
    }

    const mapBounds = annotationMap.getBounds();
    const southWest = mapBounds.getSouthWest();
    const northEast = mapBounds.getNorthEast();

    const minLat = southWest.lat;
    const maxLat = northEast.lat;
    const minLng = southWest.lng;
    const maxLng = northEast.lng;

    // Helper to generate random number in range
    const getRandom = (min, max) => Math.random() * (max - min) + min;

    // Generate random start point
    const startLat = getRandom(minLat, maxLat);
    const startLng = getRandom(minLng, maxLng);
    startMarker = L.marker([startLat, startLng], { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
    startMarker.bindPopup("Start Point").openPopup();
    document.getElementById('start-point-coords').textContent = `Start: ${startLat.toFixed(4)}, ${startLng.toFixed(4)}`;

    // Generate random end point (ensure it's somewhat distant from start)
    let endLat, endLng;
    do {
        endLat = getRandom(minLat, maxLat);
        endLng = getRandom(minLng, maxLng);
    } while (getDistance({lat: startLat, lng: startLng}, {lat: endLat, lng: endLng}) < (Math.max(maxLat-minLat, maxLng-minLng) * 0.2)); // Ensure at least 20% of map span away

    endMarker = L.marker([endLat, endLng], { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
    endMarker.bindPopup("End Point").openPopup();
    document.getElementById('end-point-coords').textContent = `End: ${endLng.toFixed(4)}, ${endLat.toFixed(4)}`;


    // Generate 3-5 random constraint areas
    const numConstraints = Math.floor(getRandom(3, 6));
    const typeSelect = document.getElementById('annotation-type');
    const annotationTypes = Array.from(typeSelect.options).map(opt => ({
        value: opt.value,
        weight: parseFloat(opt.dataset.weight),
        color: opt.dataset.color
    }));

    for (let i = 0; i < numConstraints; i++) {
        const randomType = annotationTypes[Math.floor(Math.random() * annotationTypes.length)];
        const shapeType = Math.random() > 0.5 ? 'polygon' : 'rectangle'; // Randomly choose polygon or rectangle

        let layer;
        let geojsonFeature;

        if (shapeType === 'polygon') {
            const numVertices = Math.floor(getRandom(3, 7)); // 3 to 6 vertices
            const points = [];
            const centerLat = getRandom(minLat + (maxLat-minLat)*0.2, maxLat - (maxLat-minLat)*0.2); // Avoid edges for polygon center
            const centerLng = getRandom(minLng + (maxLng-minLng)*0.2, maxLng - (maxLng-minLng)*0.2);
            const radiusLat = (maxLat - minLat) * getRandom(0.05, 0.15); // Polygon size relative to map
            const radiusLng = (maxLng - minLng) * getRandom(0.05, 0.15);

            for (let j = 0; j < numVertices; j++) {
                const angle = (j / numVertices) * 2 * Math.PI;
                points.push([
                    Math.max(minLat, Math.min(maxLat, centerLat + Math.sin(angle) * radiusLat + (Math.random()-0.5)*radiusLat*0.2)),
                    Math.max(minLng, Math.min(maxLng, centerLng + Math.cos(angle) * radiusLng + (Math.random()-0.5)*radiusLng*0.2))
                ]);
            }
            layer = L.polygon(points);
        } else { // Rectangle
            const rLat1 = getRandom(minLat, maxLat - (maxLat-minLat)*0.1); // Ensure width/height > 0
            const rLng1 = getRandom(minLng, maxLng - (maxLng-minLng)*0.1);
            const rLat2 = getRandom(rLat1 + (maxLat-minLat)*0.05, maxLat); // Min 5% size
            const rLng2 = getRandom(rLng1 + (maxLng-minLng)*0.05, maxLng);
            layer = L.rectangle([[rLat1, rLng1], [rLat2, rLng2]]);
        }
        
        geojsonFeature = layer.toGeoJSON();
        const randomReadableType = typeSelect.querySelector(`option[value="${randomType.value}"]`).textContent.split('(')[0].trim();
        layer.setStyle({ color: randomType.color, fillColor: randomType.color, weight: 2, fillOpacity: 0.4 });
        layer.bindTooltip(randomReadableType, { permanent: false, direction: 'top' });
        drawnItems.addLayer(layer);
        annotations.push({ layer: layer, type: randomType.value, weight: randomType.weight, geojson: geojsonFeature, readableType: randomReadableType });
    }
    console.log("Random annotations generated:", annotations);
    // Optionally, fit bounds to see all generated items
    if (drawnItems.getLayers().length > 0) {
        const allItemsForBounds = new L.FeatureGroup([...drawnItems.getLayers(), startMarker, endMarker]);
        annotationMap.fitBounds(allItemsForBounds.getBounds().pad(0.1));
    }
}

let currentPointMode = null; // 'start' or 'end'
function setPointMode(mode) {
    currentPointMode = mode;
    annotationMap.getContainer().style.cursor = 'crosshair';
    annotationMap.once('click', function(e) {
        if (currentPointMode === 'start') {
            if (startMarker) annotationMap.removeLayer(startMarker);
            startMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
            startMarker.bindPopup("Start Point").openPopup();
            document.getElementById('start-point-coords').textContent = `Start: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        } else if (currentPointMode === 'end') {
            if (endMarker) annotationMap.removeLayer(endMarker);
            endMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap); // Different icon or color
            endMarker.bindPopup("End Point").openPopup();
            document.getElementById('end-point-coords').textContent = `End: ${e.latlng.lng.toFixed(4)}, ${e.latlng.lat.toFixed(4)}`;
        }
        annotationMap.getContainer().style.cursor = '';
        currentPointMode = null;
    });
}

function getAnnotationData() {
    if (!startMarker || !endMarker) {
        alert("Please set the start and end points first!");
        return null;
    }
    return {
        startPoint: { lat: startMarker.getLatLng().lat, lng: startMarker.getLatLng().lng },
        endPoint: { lat: endMarker.getLatLng().lat, lng: endMarker.getLatLng().lng },
        constraints: annotations.map(a => ({ // We'll pass GeoJSON for GA and 3D
            type: a.type,
            weight: a.weight,
            geojson: a.layer.toGeoJSON() // Ensure layer.toGeoJSON() is available or convert manually
        }))
    };
}
