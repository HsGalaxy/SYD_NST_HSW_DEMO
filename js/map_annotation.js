let annotationMap, drawControl, drawnItems, startMarker, endMarker;
const annotations = []; // Store {layer: L.Layer, type: string, weight: number, color: string}
window.annotations = annotations; // Expose annotations globally

function initAnnotationMap() {
    annotationMap = L.map('map-annotation').setView([-25.27, 133.77], 4); // Centered on Australia
    window.annotationMap = annotationMap; // Expose annotationMap globally
    console.log('Annotation map initialized and set to window.annotationMap:', window.annotationMap); // DEBUG LOG
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
    document.getElementById('save-annotations').addEventListener('click', saveAnnotations);
    document.getElementById('load-annotations').addEventListener('click', loadAnnotations);
}

function getColorForAnnotationType(annotationType) {
    const typeSelect = document.getElementById('annotation-type');
    if (typeSelect) {
        const option = typeSelect.querySelector(`option[value="${annotationType}"]`);
        if (option && option.dataset.color) {
            return option.dataset.color;
        }
    }
    // Fallback color if type not found or no color defined
    console.warn(`No color defined for annotation type: ${annotationType}. Using default.`);
    return '#808080'; // Default grey
}

async function loadPredefinedAreas() {
    const typeSelect = document.getElementById('annotation-type');
    const oceanOption = Array.from(typeSelect.options).find(opt => opt.value === 'ocean_absolute_repulsor');

    if (!oceanOption) {
        console.error("Ocean annotation type not found in dropdown.");
        return;
    }

    const oceanWeight = parseFloat(oceanOption.dataset.weight);
    const oceanColor = oceanOption.dataset.color;
    const oceanReadableType = oceanOption.textContent.split('(')[0].trim();
    let fetchedData = null; // Declare fetchedData here to make it accessible later

    // --- Fallback simplified coordinates ---
    const australiaMainlandSimpleFallback = [
        [-12.46, 130.84], [-10.68, 142.56], [-17.96, 146.03], [-28.99, 153.55],
        [-37.81, 144.96], [-34.92, 138.60], [-31.95, 115.86], [-20.34, 118.52],
        [-12.46, 130.84]
    ];
    const tasmaniaSimpleFallback = [
        [-40.5, 144.5], [-40.5, 148.5], [-43.5, 148.5], [-43.5, 144.5], [-40.5, 144.5]
    ];
    let australianCoastlineCoords = [australiaMainlandSimpleFallback, tasmaniaSimpleFallback]; // Default to fallback for holes
    let visualLandStyle = { color: '#FFD700', fillColor: '#FFD700', weight: 1, fillOpacity: 0.3 }; // Default to fallback style

    // --- Attempt to fetch high-resolution coastline ---
    const coastlineUrl = 'static/aus-coast.json'; // Use the new filtered NSW file

    try {
        if (coastlineUrl) {
            console.log(`Fetching coastline from: ${coastlineUrl}`);
            fetchedData = await fetchAndProcessCoastline(coastlineUrl);

            if (fetchedData && fetchedData.type === 'polygon' && fetchedData.data.length > 0) {
                australianCoastlineCoords = fetchedData.data; // Use these Polygon/MultiPolygon rings for ocean holes
                visualLandStyle = { color: '#228B22', fillColor: '#32CD32', weight: 1, fillOpacity: 0.4 }; // Green for high-fidelity land
                console.log("Using fetched Polygon/MultiPolygon data for landmass holes and filled visual layer.");

                // If the GeoJSON also contained line data (e.g. rivers, roads along with land polygons),
                // and fetchAndProcessCoastline was modified to return them separately, draw them.
                if (fetchedData.visualLines && fetchedData.visualLines.length > 0) {
                    const additionalLineLayer = L.polyline(fetchedData.visualLines, { color: '#556B2F', weight: 1, dashArray: '5, 5' });
                    additionalLineLayer.bindTooltip("Additional Lines from GeoJSON", { permanent: false, direction: 'top' });
                    drawnItems.addLayer(additionalLineLayer);
                    console.log("Additionally drew visual lines found in GeoJSON.");
                }

            } else if (fetchedData && fetchedData.type === 'linestring' && fetchedData.data.length > 0) {
                // Convert LineString data to polygon approximation for better ocean/land separation
                console.log("Converting LineString data to polygon approximation for ocean holes...");
                
                try {
                    const convertedPolygons = convertLineStringsToPolygons(fetchedData.data);
                    if (convertedPolygons.length > 0) {
                        australianCoastlineCoords = convertedPolygons;
                        visualLandStyle = { color: '#228B22', fillColor: '#32CD32', weight: 1, fillOpacity: 0.4 }; // Green for converted polygons
                        console.log(`Successfully converted ${convertedPolygons.length} LineString segments to polygon approximations.`);
                    } else {
                        console.warn("Failed to convert LineStrings to polygons, using fallback.");
                    }
                } catch (conversionError) {
                    console.error("Error converting LineStrings to polygons:", conversionError);
                }

                // Display the original LineString data as visual coastline
                const fetchedLineLayer = L.polyline(fetchedData.data, { color: '#006400', weight: 2 }); // Dark green for detailed lines
                fetchedLineLayer.bindTooltip("Coastline (Fetched Lines - Visual Only)", { permanent: false, direction: 'top' });
                drawnItems.addLayer(fetchedLineLayer);
                console.log("Displaying fetched LineString data as visual coastline.");
                
            } else {
                console.warn("Fetched coastline data was null, empty, or not of expected type (Polygon/MultiPolygon/LineString). Using full fallback.");
                // australianCoastlineCoords and visualLandStyle remain their default fallback values.
            }
        } else {
            console.warn("Coastline URL not provided or is placeholder, using fallback simplified data.");
        }
    } catch (error) {
        console.error("Error fetching or processing coastline data, using fallback:", error);
    }

    // Add the primary filled land visual layer.
    // This will be green if from fetched polygons, or yellow if from fallback.
    // If only linestrings were fetched, this 'australiaVisualFilledLayer' will be the yellow fallback.
    const australiaVisualFilledLayer = L.polygon(australianCoastlineCoords, visualLandStyle);
    let mainLandTooltip = "Australia (Landmass - Fallback)";
    if (fetchedData && fetchedData.type === 'polygon' && fetchedData.data.length > 0) {
        mainLandTooltip = "Australia (Landmass - Processed GeoJSON Polygons)";
    } else if (fetchedData && fetchedData.type === 'linestring' && fetchedData.data.length > 0) {
        // If we converted linestrings to polygons, update the tooltip
        mainLandTooltip = "Australia (Landmass - Converted from LineStrings)";
    }
    australiaVisualFilledLayer.bindTooltip(mainLandTooltip, { permanent: false, direction: 'top' });
    drawnItems.addLayer(australiaVisualFilledLayer);
    console.log(`Main filled land layer added. Tooltip: ${mainLandTooltip}`);


    const worldOuterRing = [
        [-85, -180], [85, -180], [85, 180], [-85, 180], [-85, -180]
    ];

    // australianCoastlineCoords for holes is now correctly set to high-fidelity polygon data if available,
    // or fallback simple polygons otherwise (this includes the case where only linestrings were fetched).
    const oceanPolygonHoles = australianCoastlineCoords.map(polygonRing => {
        return polygonRing;
    });

    const oceanLayerDefinition = [worldOuterRing, ...oceanPolygonHoles];

    const oceanLayer = L.polygon(oceanLayerDefinition, {
        color: oceanColor, fillColor: oceanColor, weight: 1,
        fillOpacity: 0.3, fillRule: 'evenodd'
    });

    const oceanGeoJSON = oceanLayer.toGeoJSON();
    oceanLayer.bindTooltip(oceanReadableType, { permanent: false, direction: 'top' });
    drawnItems.addLayer(oceanLayer);
    annotations.push({
        layer: oceanLayer, type: 'ocean_absolute_repulsor',
        weight: oceanWeight, geojson: oceanGeoJSON, readableType: oceanReadableType
    });

    console.log("Predefined Ocean area (with Australia as a hole) loaded as absolute repulsor.");
    // Determine bounds for fitting view
    let layerToFit = null;
    if (fetchedData && (fetchedData.type === 'polygon' || fetchedData.type === 'linestring') && australiaVisualFilledLayer) {
        layerToFit = australiaVisualFilledLayer;
    } else if (fetchedData && fetchedData.type === 'linestring' && fetchedData.data.length > 0) {
        const lineLayerForBounds = drawnItems.getLayers().find(l => l.getTooltip && l.getTooltip().getContent() === "Coastline (Fetched Lines - Visual Only)");
        if (lineLayerForBounds) layerToFit = lineLayerForBounds;
    } else if (australiaVisualFilledLayer) { // Fallback to the simple filled layer if it was drawn
        layerToFit = australiaVisualFilledLayer;
    }
    
    if (layerToFit && layerToFit.getBounds().isValid()) {
        annotationMap.fitBounds(layerToFit.getBounds().pad(0.2));
    } else {
        annotationMap.setView([-25.27, 133.77], 4); // Default fallback view
    }
}

async function fetchAndProcessCoastline(url) {
    try {
        console.log(`[Progress] Starting fetch for: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalSize = contentLength ? parseInt(contentLength, 10) : null;
        let loadedSize = 0;
        let chunks = [];
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        console.log(`[Progress] Fetch complete. Starting to read ${totalSize ? (totalSize / (1024*1024)).toFixed(2) + 'MB' : 'unknown size'} of data...`);

        while (true) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
                loadedSize += value.length;
                if (totalSize) {
                    console.log(`[Progress] Downloaded ${(loadedSize / (1024*1024)).toFixed(2)}MB / ${(totalSize / (1024*1024)).toFixed(2)}MB (${Math.round((loadedSize/totalSize)*100)}%)`);
                } else {
                    console.log(`[Progress] Downloaded ${(loadedSize / (1024*1024)).toFixed(2)}MB`);
                }
                 // Yield to browser occasionally during download of very large files
                if (loadedSize % (5 * 1024 * 1024) < value.length ) { // Yield approx every 5MB
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } catch (streamError) {
                console.error("[Error] Error reading stream:", streamError);
                throw streamError; // Re-throw to be caught by the outer try-catch
            }
        }
        
        console.log("[Progress] Download complete. Concatenating chunks...");
        // Concatenate chunks into a single Uint8Array
        let fullResponseArray = new Uint8Array(loadedSize);
        let position = 0;
        for (const chunk of chunks) {
            fullResponseArray.set(chunk, position);
            position += chunk.length;
        }
        chunks = null; // Free memory

        console.log("[Progress] Decoding text...");
        const responseText = decoder.decode(fullResponseArray);
        fullResponseArray = null; // Free memory

        let geojsonData;
        try {
            console.log("[Progress] Parsing JSON (this may still take a while for very large JSON)...");
            geojsonData = JSON.parse(responseText);
            console.log(`[Progress] JSON parsed successfully. GeoJSON Type: ${geojsonData.type}. Starting coordinate processing...`);
        } catch (e) {
            console.error("[Error] Failed to parse JSON string:", e);
            console.warn("[Info] The GeoJSON file might be malformed, or too large for the JS engine to parse even after download. Consider simplifying it.");
            throw e; // Re-throw to be caught by the outer try-catch and trigger fallback
        }
        // responseText is now free to be garbage collected if no other references exist

        let landmassDefiningCoords = [];
        let visualLineCoords = [];
        let hasPolygonData = false;
        let featuresProcessed = 0;
        const totalFeatures = geojsonData.features ? geojsonData.features.length : 1; // For progress reporting
        const reportInterval = Math.max(100, Math.floor(totalFeatures / 10)); // Report every 100 features or 10%

        const swapCoordsRing = (ring) => {
            if (!Array.isArray(ring)) { console.warn("Invalid ring (not an array):", ring); return []; }
            return ring.map(coord => {
                if (!Array.isArray(coord) || coord.length < 2) { console.warn("Invalid coord in ring:", coord); return [0,0];}
                return [coord[1], coord[0]];
            });
        };

        const processGeometry = async (geometry) => { // Made async to allow yielding
            if (!geometry || !geometry.coordinates) {
                console.warn("Skipping geometry: no coordinates property.", geometry);
                return;
            }
            // console.log(`Processing geometry type: ${geometry.type}`); // Can be too verbose

            if (geometry.type === 'Polygon') {
                if (Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
                    landmassDefiningCoords.push(swapCoordsRing(geometry.coordinates[0]));
                    hasPolygonData = true;
                } else { /* console.warn("Polygon geometry has invalid coordinates structure:", geometry.coordinates); */ }
            } else if (geometry.type === 'MultiPolygon') {
                if (Array.isArray(geometry.coordinates)) {
                    for (const polygonCoordinateArray of geometry.coordinates) {
                        if (Array.isArray(polygonCoordinateArray) && polygonCoordinateArray.length > 0) {
                            landmassDefiningCoords.push(swapCoordsRing(polygonCoordinateArray[0]));
                            hasPolygonData = true;
                        } else { /* console.warn("MultiPolygon part has invalid coordinates structure:", polygonCoordinateArray); */ }
                    }
                } else { /* console.warn("MultiPolygon geometry has invalid coordinates structure:", geometry.coordinates); */ }
            } else if (geometry.type === 'LineString') {
                if (Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
                    visualLineCoords.push(swapCoordsRing(geometry.coordinates));
                } else { /* console.warn("LineString geometry has invalid coordinates structure:", geometry.coordinates); */ }
            } else if (geometry.type === 'MultiLineString') {
                if (Array.isArray(geometry.coordinates)) {
                    for (const lineCoordinateArray of geometry.coordinates) {
                        if (Array.isArray(lineCoordinateArray) && lineCoordinateArray.length > 1) {
                            visualLineCoords.push(swapCoordsRing(lineCoordinateArray));
                        } else { /* console.warn("MultiLineString part has invalid coordinates structure:", lineCoordinateArray); */ }
                    }
                } else { /* console.warn("MultiLineString geometry has invalid coordinates structure:", geometry.coordinates); */ }
            }
            // else { console.log(`Skipping unsupported geometry type: ${geometry.type}`); }
        };

        if (geojsonData.type === 'FeatureCollection') {
            if (geojsonData.features && Array.isArray(geojsonData.features)) {
                console.log(`[Progress] Processing ${totalFeatures} features...`);
                for (const feature of geojsonData.features) {
                    if (feature && feature.geometry) {
                        await processGeometry(feature.geometry); // Await if processGeometry becomes async for yielding
                    }
                    featuresProcessed++;
                    if (featuresProcessed % reportInterval === 0) {
                        console.log(`[Progress] Processed ${featuresProcessed}/${totalFeatures} features...`);
                        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to browser
                    }
                }
            } else { console.warn("FeatureCollection has no 'features' array or it's invalid."); }
        } else {
            console.log(`[Progress] Processing single geometry feature...`);
            await processGeometry(geojsonData); // Await if processGeometry becomes async for yielding
        }
        console.log(`[Progress] Coordinate processing complete.`);

        if (hasPolygonData && landmassDefiningCoords.length > 0) {
            console.log(`Extracted ${landmassDefiningCoords.length} Polygon/MultiPolygon rings for defining landmass holes.`);
            return { type: 'polygon', data: landmassDefiningCoords, visualLines: visualLineCoords.length > 0 ? visualLineCoords : null };
        } else if (visualLineCoords.length > 0) {
            console.log(`Extracted ${visualLineCoords.length} LineString/MultiLineString segments for visual coastline. Ocean repulsor will use fallback for holes.`);
            return { type: 'linestring', data: visualLineCoords };
        } else {
            console.warn("No usable Polygon, MultiPolygon, LineString, or MultiLineString data found in GeoJSON after processing.");
            return null;
        }

    } catch (error) {
        console.error('Failed to fetch or process coastline data:', error);
        return null;
    }
}

function randomlyAnnotate() {
    // Clear existing annotations and markers
    drawnItems.clearLayers();
    annotations.length = 0; // Clear the array
    if (startMarker) {
        annotationMap.removeLayer(startMarker);
        window.startMarker = startMarker = null;
        document.getElementById('start-point-coords').textContent = 'Start: Not Set';
    }
    if (endMarker) {
        annotationMap.removeLayer(endMarker);
        window.endMarker = endMarker = null;
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
    window.startMarker = startMarker = L.marker([startLat, startLng], { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
    window.startMarker.bindPopup("Start Point").openPopup();
    document.getElementById('start-point-coords').textContent = `Start: ${startLat.toFixed(4)}, ${startLng.toFixed(4)}`;

    // Generate random end point (ensure it's somewhat distant from start)
    let endLat, endLng;
    do {
        endLat = getRandom(minLat, maxLat);
        endLng = getRandom(minLng, maxLng);
    } while (getDistance({lat: startLat, lng: startLng}, {lat: endLat, lng: endLng}) < (Math.max(maxLat-minLat, maxLng-minLng) * 0.2)); // Ensure at least 20% of map span away

    window.endMarker = endMarker = L.marker([endLat, endLng], { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
    window.endMarker.bindPopup("End Point").openPopup();
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
            window.startMarker = startMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap);
            window.startMarker.bindPopup("Start Point").openPopup();
            document.getElementById('start-point-coords').textContent = `Start: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        } else if (currentPointMode === 'end') {
            if (endMarker) annotationMap.removeLayer(endMarker);
            window.endMarker = endMarker = L.marker(e.latlng, { draggable: true, icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).addTo(annotationMap); // Different icon or color
            window.endMarker.bindPopup("End Point").openPopup();
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
            geojson: a.layer.toGeoJSON(), // Ensure layer.toGeoJSON() is available or convert manually
            readableType: a.readableType
        }))
    };
}

function saveAnnotations() {
    const data = getAnnotationData();
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map_annotations.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadAnnotations() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // Clear existing annotations
                drawnItems.clearLayers();
                annotations.length = 0;
                if (startMarker) {
                    annotationMap.removeLayer(startMarker);
                    startMarker = null;
                }
                if (endMarker) {
                    annotationMap.removeLayer(endMarker);
                    endMarker = null;
                }

                // Load start and end points
                if (data.startPoint) {
                    startMarker = L.marker([data.startPoint.lat, data.startPoint.lng], { 
                        draggable: true,
                        icon: L.icon({
                            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                            iconSize: [25,41],
                            iconAnchor: [12,41]
                        })
                    }).addTo(annotationMap);
                    startMarker.bindPopup("Start Point").openPopup();
                    document.getElementById('start-point-coords').textContent = 
                        `Start: ${data.startPoint.lat.toFixed(4)}, ${data.startPoint.lng.toFixed(4)}`;
                }

                if (data.endPoint) {
                    endMarker = L.marker([data.endPoint.lat, data.endPoint.lng], {
                        draggable: true,
                        icon: L.icon({
                            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
                            iconSize: [25,41],
                            iconAnchor: [12,41]
                        })
                    }).addTo(annotationMap);
                    endMarker.bindPopup("End Point").openPopup();
                    document.getElementById('end-point-coords').textContent = 
                        `End: ${data.endPoint.lng.toFixed(4)}, ${data.endPoint.lat.toFixed(4)}`;
                }

                // Load constraints
                if (data.constraints) {
                    data.constraints.forEach(constraint => {
                        const styleColor = getColorForAnnotationType(constraint.type);
                        const layer = L.geoJSON(constraint.geojson, {
                            style: {
                                color: styleColor,
                                fillColor: styleColor,
                                weight: 2,
                                fillOpacity: 0.4
                            }
                        }).getLayers()[0];
                        
                        // Ensure layer is valid before binding tooltip
                        if (!layer) {
                            console.error("Failed to create layer from GeoJSON constraint:", constraint);
                            return; // Skip this constraint
                        }
                        layer.bindTooltip(constraint.readableType || constraint.type, { permanent: false, direction: 'top' });
                        drawnItems.addLayer(layer);
                        annotations.push({
                            layer: layer,
                            type: constraint.type,
                            weight: constraint.weight,
                            geojson: constraint.geojson,
                            readableType: constraint.readableType
                        });
                    });
                }

                // Fit bounds to show all items
                if (drawnItems.getLayers().length > 0) {
                    const allItemsForBounds = new L.FeatureGroup([...drawnItems.getLayers(), startMarker, endMarker].filter(Boolean));
                    annotationMap.fitBounds(allItemsForBounds.getBounds().pad(0.1));
                }
            } catch (error) {
                console.error('Error loading annotations:', error);
                alert('Error loading annotations file. Please make sure it\'s a valid JSON file.');
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}
