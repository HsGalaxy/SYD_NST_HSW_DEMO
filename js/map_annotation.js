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
        annotations.push({ layer: layer, type: annotationType, weight: weight, geojson: layer.toGeoJSON() });
        console.log("Annotation added:", annotations[annotations.length-1]);
    });

    document.getElementById('set-start-point').addEventListener('click', () => setPointMode('start'));
    document.getElementById('set-end-point').addEventListener('click', () => setPointMode('end'));
}

let currentPointMode = null; // 'start' or 'end'
function setPointMode(mode) {
    currentPointMode = mode;
    annotationMap.getContainer().style.cursor = 'crosshair';
    annotationMap.once('click', function(e) {
        if (currentPointMode === 'start') {
            if (startMarker) annotationMap.removeLayer(startMarker);
            startMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
            startMarker.bindPopup("起点").openPopup();
            document.getElementById('start-point-coords').textContent = `起点: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        } else if (currentPointMode === 'end') {
            if (endMarker) annotationMap.removeLayer(endMarker);
            endMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap); // Different icon or color
            endMarker.bindPopup("终点").openPopup();
            document.getElementById('end-point-coords').textContent = `终点: ${e.latlng.lng.toFixed(4)}, ${e.latlng.lat.toFixed(4)}`;
        }
        annotationMap.getContainer().style.cursor = '';
        currentPointMode = null;
    });
}

function getAnnotationData() {
    if (!startMarker || !endMarker) {
        alert("请先设置起点和终点！");
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
