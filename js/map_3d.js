// CesiumJS Globe Visualization
let cesiumViewer;

// Cesium ion access token (replace with your own if needed, or use default)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjVjMjJhMS0wNWJiLTRmZjYtYmUxOS1jNzJkNzc1YTEyZmUiLCJpZCI6MzAzNDg5LCJpYXQiOjE3NDc1NjI4MTR9.7AsIMXnLLyfiiYxF9JPFbcZuJoauBam46tnEaVpwtqg'; // Example token

function init3DMap() {
    if (cesiumViewer) {
        // cesiumViewer.entities.removeAll(); // Clear previous entities if re-initializing
        return; // Already initialized
    }
    try {
        cesiumViewer = new Cesium.Viewer('cesiumContainer', {
            // terrainProvider: Cesium.createWorldTerrain(), // For 3D terrain
            animation: false, // Hide animation widget
            baseLayerPicker: true, // Show base layer picker
            fullscreenButton: false, // Hide fullscreen button
            geocoder: false, // Hide geocoder
            homeButton: false, // Hide home button
            infoBox: true, // Show info box
            sceneModePicker: true, // Show scene mode picker (3D, 2D, Columbus View)
            selectionIndicator: true, // Show selection indicator
            timeline: false, // Hide timeline
            navigationHelpButton: false, // Hide navigation help button
            scene3DOnly: false, // Allow 2D and Columbus View
            // imageryProvider: new Cesium.OpenStreetMapImageryProvider({ // Use OSM for consistency
            //     url : 'https://a.tile.openstreetmap.org/'
            // })
        });
        // Add Cesium OSM Buildings, if desired and available
        // cesiumViewer.scene.primitives.add(Cesium.createOsmBuildings());

        // Fly to a general view of China
        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(104.0, 35.0, 9000000.0), // Lon, Lat, Height
            orientation: {
                heading: Cesium.Math.toRadians(0.0),
                pitch: Cesium.Math.toRadians(-90.0),
                roll: 0.0
            }
        });
    } catch (error) {
        console.error("Error initializing Cesium:", error);
        document.getElementById('cesiumContainer').innerHTML = `<p style="color:red; padding:20px;">Failed to load 3D map. Error: ${error.message}. Please ensure CesiumJS is correctly configured and your browser supports WebGL.</p>`;
    }
}


function displayRouteIn3D(routePoints, constraints) {
    if (!cesiumViewer) {
        console.error("Cesium viewer not initialized.");
        init3DMap(); // Try to initialize if not already
        if (!cesiumViewer) return;
    }
    else{
        console.log("Hello")
    }

    cesiumViewer.entities.removeAll(); // Clear previous entities

    // Display constraints
    constraints.forEach(constraint => {
        const geojson = constraint.geojson;
        const colorStr = document.querySelector(`#annotation-type option[value="${constraint.type}"]`).dataset.color || '#888888';
        const cesiumColor = Cesium.Color.fromCssColorString(colorStr).withAlpha(0.4);
        const readableConstraintType = constraint.readableType || constraint.type; // Fallback to type if readableType is not there

        if (geojson.geometry.type === "Polygon") {
            const hierarchy = geojson.geometry.coordinates[0].map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]));
            cesiumViewer.entities.add({
                name: readableConstraintType,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(hierarchy),
                    material: cesiumColor,
                    outline: true,
                    outlineColor: Cesium.Color.BLACK
                },
                label: {
                    text: readableConstraintType,
                    font: '12pt sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -9), // Adjust as needed
                    showBackground: true,
                    backgroundColor: new Cesium.Color(0.165, 0.165, 0.165, 0.8)
                }
            });
        } else if (geojson.geometry.type === "LineString") {
            const positions = geojson.geometry.coordinates.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]));
             cesiumViewer.entities.add({
                name: readableConstraintType,
                polyline: {
                    positions: positions,
                    width: 5,
                    material: cesiumColor
                },
                label: {
                    text: readableConstraintType,
                    font: '12pt sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    // For polylines, position the label at the first point or center
                    position: positions[0],
                    pixelOffset: new Cesium.Cartesian2(0, -9),
                    showBackground: true,
                    backgroundColor: new Cesium.Color(0.165, 0.165, 0.165, 0.8)
                }
            });
        } else if (geojson.geometry.type === "Point") {
            const position = Cesium.Cartesian3.fromDegrees(geojson.geometry.coordinates[0], geojson.geometry.coordinates[1]);
             cesiumViewer.entities.add({
                name: readableConstraintType,
                position: position,
                point: {
                    pixelSize: 10,
                    color: cesiumColor
                },
                label: {
                    text: readableConstraintType,
                    font: '12pt sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -15), // Adjust for point marker
                    showBackground: true,
                    backgroundColor: new Cesium.Color(0.165, 0.165, 0.165, 0.8)
                }
            });
        }
    });


    // Display the best route
    if (routePoints && routePoints.length > 0) {
        const routePositions = routePoints.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat));
        cesiumViewer.entities.add({
            name: "Optimized High-Speed Railway Route",
            polyline: {
                positions: routePositions,
                width: 8,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.3,
                    color: Cesium.Color.CYAN
                }),
                clampToGround: true // Drape on terrain if available
            }
        });
        // Fly to the route
        cesiumViewer.flyTo(cesiumViewer.entities);
    }
}
