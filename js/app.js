document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('app-loader');
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    let gaMapInitialized = false; // Flag to check if GA map has been initialized
    let annotationMapInitialized = false; // Flag for annotation map (though it's init early)
    let cesiumMapInitialized = false; // Flag for Cesium map
    let rrtChartInstance = null; // For the RRT cost chart

    // Initial map initializations
    try {
        initAnnotationMap(); // Annotation map is on the first tab, so initialize it
        annotationMapInitialized = true; 
        // initGAMap(); // Defer GA map initialization
        // init3DMap(); // Defer Cesium map initialization
    } catch (error) {
        console.error("Error initializing maps on load:", error);
        alert("Map initialization failed, please check the browser console for more information.");
    } finally {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and content
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Activate clicked tab and its content
            tab.classList.add('active');
            const targetTabId = tab.dataset.tab;
            const activeContent = document.getElementById(targetTabId);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Handle map specific logic when a tab becomes active
            if (targetTabId === 'annotation') {
                if (annotationMap) {
                    setTimeout(() => { // Ensure DOM is ready and visible
                        annotationMap.invalidateSize();
                    }, 0);
                }
            } else if (targetTabId === 'optimization') {
                if (!gaMapInitialized) {
                    initGAMap(); // Initialize GA map on first click
                    gaMapInitialized = true;
                } else if (gaMap) {
                    setTimeout(() => { // Ensure DOM is ready and visible
                        gaMap.invalidateSize();
                    }, 0);
                }
            } else if (targetTabId === 'visualization3d') {
                if (!cesiumMapInitialized) {
                    init3DMap(); // Initialize Cesium map on first click
                    cesiumMapInitialized = true;
                } else if (cesiumViewer) {
                    // Cesium might not need invalidateSize in the same way,
                    // but if there were sizing issues, you could try viewer.resize()
                    // For now, just ensuring it's initialized is key.
                }
            }
        });
    });

    // Path planning with RRT*
    function startPathPlanning() {
        console.log("startPathPlanning called via button."); // Verify function is triggered

        if (!window.startMarker || !window.endMarker) {
            alert("Please set both Start and End points on the Annotation tab before planning.");
            return; // Exit if points are not set
        }
        if (!window.annotationMap) {
            alert("Annotation map is not initialized. Please visit the Annotation tab first.");
            return;
        }
        // This function is now orphaned unless a new UI element calls it.
        const startPoint = window.startMarker.getLatLng();
        const endPoint = window.endMarker.getLatLng();
        const constraints = window.annotations.map(a => ({
            type: a.type,
            weight: a.weight,
            geojson: a.geojson
        }));

        const mapBounds = window.annotationMap.getBounds();
        const bounds = {
            minLat: mapBounds.getSouthWest().lat,
            maxLat: mapBounds.getNorthEast().lat,
            minLng: mapBounds.getSouthWest().lng,
            maxLng: mapBounds.getNorthEast().lng
        };

        const options = {
            maxIterations: parseInt(document.getElementById('max-iterations').value),
            stepSize: parseFloat(document.getElementById('step-size').value),
            goalSampleRate: parseFloat(document.getElementById('goal-sample-rate').value),
            rewireRadius: parseFloat(document.getElementById('rewire-radius').value)
        };

        // Update progress UI
        document.getElementById('total-generations').textContent = options.maxIterations;
        document.getElementById('current-generation').textContent = '0';
        document.getElementById('best-fitness').textContent = 'N/A';
        document.getElementById('ga-progress-bar').style.width = '0%';

        initializeRRTChart(); // Initialize/reset the chart

        // Create and run RRT* planner
        const planner = new RRTStar(startPoint, endPoint, constraints, bounds, options);
        
        // Run planning in chunks to update UI
        let iterations = 0;
        const chunkSize = 5; // Reduced chunk size for more frequent UI updates
        let finalPathFor3D = null; // Store the path for 3D display
        
        function runChunk() {
            const startTime = performance.now();
            let chunkIterations = 0;
            
            while (chunkIterations < chunkSize && iterations < options.maxIterations) {
                // Run one extension step of RRT*
                const pathFoundThisStep = planner.plan(); // plan() now does one step
                
                if (pathFoundThisStep) {
                    // Goal reached in this step
                    document.getElementById('current-generation').textContent = iterations;
                    const currentCost = planner.costs[planner.costs.length - 1]; // Cost to the goal node
                    if (currentCost !== undefined) {
                        document.getElementById('best-fitness').textContent = currentCost.toFixed(2);
                    } else {
                        document.getElementById('best-fitness').textContent = 'N/A';
                    }
                    document.getElementById('ga-progress-bar').style.width = '100%';
                    finalPathFor3D = pathFoundThisStep; // Store the found path
                    
                    // Draw the path
                    if (window.pathLayer) {
                        window.optimizationMap.removeLayer(window.pathLayer);
                    }
                    window.pathLayer = L.polyline(finalPathFor3D, { // Use finalPathFor3D
                        color: 'red',
                        weight: 3,
                        opacity: 0.8
                    }).addTo(window.optimizationMap);
                    
                    // Fit bounds to show the path
                    window.optimizationMap.fitBounds(window.pathLayer.getBounds().pad(0.1));
                    
                    // Path found, proceed to 3D visualization
                    switchTo3DAndDisplay(finalPathFor3D, constraints);
                    return; // Stop chunk execution, goal is reached
                }
                
                iterations++;
                chunkIterations++;
                
                // Update chart with cost of the last added node by RRT*
                // planner.plan() in RRTStar adds a node and its cost to planner.costs array
                if (planner.vertices.length > 0) { // Check if RRT* has added any node
                    const lastNodeIndex = planner.vertices.length - 1;
                    const costOfLastNode = planner.costs[lastNodeIndex];
                    if (costOfLastNode !== undefined) {
                        updateRRTChart(iterations, costOfLastNode);
                        // Optionally update the 'best-fitness' text field more frequently too
                        // document.getElementById('best-fitness').textContent = costOfLastNode.toFixed(2);
                    }
                }
                
                // Update progress bar and iteration count
                document.getElementById('current-generation').textContent = iterations;
                document.getElementById('ga-progress-bar').style.width =
                    (iterations / options.maxIterations * 100) + '%';
                
                // Original progress update logic (can be kept or removed if chart is primary)
                // if (iterations % 1 === 0 || chunkIterations === chunkSize) { // Update more often
                // }
                // Removed extra closing brace that was here
            } // This closes the while loop from line 126
            
            // Check if we should continue
            if (iterations < options.maxIterations) {
                const elapsed = performance.now() - startTime;
                // Introduce a minimum delay to make the process more visible, e.g., 50ms
                // Adjust 50 to a higher value for slower visualization, or lower for faster.
                const delay = Math.max(50, 16 - elapsed);
                setTimeout(runChunk, delay);
            } else {
                // Max iterations reached for the entire process
                document.getElementById('current-generation').textContent = iterations;
                document.getElementById('ga-progress-bar').style.width = '100%';

                if (!finalPathFor3D) { // If goal wasn't directly reached during iterations
                    console.log("Max iterations reached. Attempting to get best effort path to goal.");
                    finalPathFor3D = planner.getBestPathToGoalAttempt(); // Get path to closest node
                    if (finalPathFor3D && finalPathFor3D.length > 0) {
                        // Update best-fitness with the cost of this best-effort path
                        // To do this accurately, getBestPathToGoalAttempt would need to return cost or
                        // we re-calculate cost here, or RRTStar.costs needs to be indexed by vertex for the end of this path.
                        // For now, just draw it.
                        const lastNodeOfPath = finalPathFor3D[finalPathFor3D.length - 1];
                        const indexOfLastNode = planner.vertices.findIndex(v => v.lat === lastNodeOfPath.lat && v.lng === lastNodeOfPath.lng);
                        if (indexOfLastNode !== -1 && planner.costs[indexOfLastNode] !== undefined) {
                            document.getElementById('best-fitness').textContent = planner.costs[indexOfLastNode].toFixed(2);
                        } else {
                             document.getElementById('best-fitness').textContent = 'N/A (best effort)';
                        }
                        
                        console.log("Visualizing best effort path:", finalPathFor3D);
                        if (window.pathLayer) {
                            window.optimizationMap.removeLayer(window.pathLayer);
                        }
                        window.pathLayer = L.polyline(finalPathFor3D, {
                            color: 'orange', // Different color for best effort
                            weight: 3,
                            opacity: 0.8,
                            dashArray: '5, 5'
                        }).addTo(window.optimizationMap);
                        window.optimizationMap.fitBounds(window.pathLayer.getBounds().pad(0.1));
                    }
                }

                if (finalPathFor3D && finalPathFor3D.length > 0) {
                     alert('Path planning process complete.');
                     switchTo3DAndDisplay(finalPathFor3D, constraints);
                } else {
                    alert('No path found after maximum iterations. Try adjusting parameters or constraints.');
                }
            }
        }
        
        runChunk();
    }

    function switchTo3DAndDisplay(path, constraints) {
        if (!path || path.length === 0) {
            console.warn("No path data to display in 3D.");
            return;
        }
        const viz3DButton = document.querySelector('.tab-button[data-tab="visualization3d"]');
        if (viz3DButton) {
            viz3DButton.click(); // Activate 3D tab
        }
        // Ensure 3D map is ready then display
        setTimeout(() => { // Give a moment for tab switch and potential 3D map init
            if (typeof displayRouteIn3D === 'function') {
                // Convert RRT* path (array of {lat, lng}) to format expected by displayRouteIn3D if needed.
                // Assuming displayRouteIn3D expects an array of {lat, lng} points.
                displayRouteIn3D(path, constraints);
            } else {
                console.warn("displayRouteIn3D function not found or Cesium viewer not ready for final display.");
                alert("Could not display path in 3D. 3D view or display function might not be ready.");
            }
        }, 500); // Increased delay to allow tab switch and Cesium init
    }

    function initializeRRTChart() {
        const ctx = document.getElementById('fitness-chart')?.getContext('2d');
        if (!ctx) {
            console.warn("Fitness chart canvas not found. Cannot initialize RRT chart.");
            return;
        }

        if (rrtChartInstance) {
            rrtChartInstance.destroy();
            rrtChartInstance = null;
        }

        rrtChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], // Iteration numbers
                datasets: [
                    {
                        label: 'Path Cost (RRT*)',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)', // Cyan
                        tension: 0.1,
                        pointRadius: 0, // Hide points for a smoother line if many data points
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Cost' }
                    },
                    x: {
                        title: { display: true, text: 'Iteration' }
                    }
                },
                animation: { duration: 0 } // No animation for faster updates, or a small value
            }
        });
        console.log("RRT Chart Initialized");
    }

    function updateRRTChart(iteration, cost) {
        if (!rrtChartInstance || !rrtChartInstance.data) {
            // console.warn("RRT chart not initialized, cannot update.");
            return;
        }
        // Throttle chart updates to, e.g., every 5 iterations to avoid performance issues
        if (iteration % 5 !== 0 && iteration !== parseInt(document.getElementById('max-iterations').value)) {
           // return;
        }

        rrtChartInstance.data.labels.push(iteration);
        rrtChartInstance.data.datasets[0].data.push(cost);
        
        // Limit the number of data points on the chart to avoid performance degradation
        const maxDataPoints = 500; // Adjust as needed
        if (rrtChartInstance.data.labels.length > maxDataPoints) {
            rrtChartInstance.data.labels.shift();
            rrtChartInstance.data.datasets[0].data.shift();
        }
        
        rrtChartInstance.update();
    }


    // Update event listeners
    document.getElementById('run-ga').addEventListener('click', startPathPlanning);
});
