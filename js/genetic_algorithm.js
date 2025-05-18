// Simplified Genetic Algorithm
let gaMap; // For displaying GA progress on a smaller map
let population = [];
let bestRouteOverall = null;
let fitnessHistory = []; // To store {gen, best, avg}
let currentGenerationNum = 0; // Renamed from currentGeneration to avoid conflict with DOM element
let gaRunning = false;

const INTERMEDIATE_POINTS = 5; // Number of intermediate points in a route

function initGAMap() {
    if (gaMap) { // If map already exists, just invalidate size (e.g., if tab was re-opened)
        setTimeout(() => gaMap.invalidateSize(), 0);
        return;
    }
    try {
        gaMap = L.map('map-optimization').setView([30.5, 114.3], 5); // Default view
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(gaMap);
        console.log("GA Map Initialized");
    } catch (e) {
        console.error("Error initializing GA map:", e);
        const mapDiv = document.getElementById('map-optimization');
        if (mapDiv) mapDiv.innerHTML = "<p style='color:red; padding:10px;'>GA地图加载失败: " + e.message + "</p>";
    }
}

function createIndividual(startPoint, endPoint) {
    const route = [startPoint];
    const latDiff = endPoint.lat - startPoint.lat;
    const lngDiff = endPoint.lng - startPoint.lng;

    for (let i = 0; i < INTERMEDIATE_POINTS; i++) {
        const ratio = (i + 1) / (INTERMEDIATE_POINTS + 1);
        route.push({
            lat: startPoint.lat + latDiff * ratio + (Math.random() - 0.5) * (Math.abs(latDiff) * 0.3 + 0.5) ,
            lng: startPoint.lng + lngDiff * ratio + (Math.random() - 0.5) * (Math.abs(lngDiff) * 0.3 + 0.5)
        });
    }
    route.push(endPoint);
    return route;
}

function calculateFitness(route, constraints) {
    let totalLength = 0;
    let penalty = 0;

    for (let i = 0; i < route.length - 1; i++) {
        totalLength += getDistance(route[i], route[i+1]);
        constraints.forEach(constraint => {
            const constraintLayer = L.geoJSON(constraint.geojson); 
            if (constraintLayer.getBounds && routeSegmentIntersectsBounds(route[i], route[i+1], constraintLayer.getBounds())) {
                // Check if the *midpoint* of the segment is inside the polygon for a slightly better check
                // A more robust solution would use a proper line-polygon intersection library (e.g., Turf.js)
                const midLat = (route[i].lat + route[i+1].lat) / 2;
                const midLng = (route[i].lng + route[i+1].lng) / 2;
                if (isPointInPolygon({lat: midLat, lng: midLng}, constraintLayer.getLayers()[0].getLatLngs()[0])) { // Assumes simple polygon
                    penalty += Math.abs(constraint.weight) * (constraint.weight > 0 ? 1 : -0.5) ; 
                }
            }
        });
    }
    return 1 / (totalLength + penalty * 10 + 0.0001); 
}

function routeSegmentIntersectsBounds(p1, p2, bounds) {
    // Check if segment's bounding box intersects the constraint's bounding box
    const segmentBounds = L.latLngBounds(p1,p2);
    return bounds.intersects(segmentBounds);
}


function selection(popWithFitness) {
    const tournamentSize = 5;
    let selected = [];
    for (let i = 0; i < popWithFitness.length; i++) {
        let bestInTournament = null;
        for (let j = 0; j < tournamentSize; j++) {
            const randomIndex = Math.floor(Math.random() * popWithFitness.length);
            const contestant = popWithFitness[randomIndex];
            if (bestInTournament === null || contestant.fitness > bestInTournament.fitness) {
                bestInTournament = contestant;
            }
        }
        selected.push(deepClone(bestInTournament.individual)); // Store a deep clone
    }
    return selected;
}

function crossover(parent1, parent2) {
    const child1 = [deepClone(parent1[0])]; 
    const child2 = [deepClone(parent2[0])];
    const crossoverPoint = Math.floor(Math.random() * (INTERMEDIATE_POINTS -1)) + 1; // Ensure crossover happens among intermediate points

    for (let i = 1; i <= INTERMEDIATE_POINTS; i++) { // Iterate through intermediate points
        if (i < crossoverPoint) {
            child1.push(deepClone(parent1[i]));
            child2.push(deepClone(parent2[i]));
        } else {
            child1.push(deepClone(parent2[i]));
            child2.push(deepClone(parent1[i]));
        }
    }
    child1.push(deepClone(parent1[parent1.length - 1])); 
    child2.push(deepClone(parent2[parent2.length - 1]));
    return [child1, child2];
}

function mutate(individual, mutationRate) {
    const mutatedIndividual = [deepClone(individual[0])]; 
    for (let i = 1; i <= INTERMEDIATE_POINTS; i++) {
        if (Math.random() < mutationRate) {
            mutatedIndividual.push({
                lat: individual[i].lat + (Math.random() - 0.5) * 0.5, 
                lng: individual[i].lng + (Math.random() - 0.5) * 0.5  
            });
        } else {
            mutatedIndividual.push(deepClone(individual[i]));
        }
    }
    mutatedIndividual.push(deepClone(individual[individual.length - 1])); 
    return mutatedIndividual;
}


let gaLayers = [];
function visualizePopulation(populationToDraw, currentBestRoute) {
    if(!gaMap) return; // Don't draw if map isn't ready

    gaLayers.forEach(layer => gaMap.removeLayer(layer));
    gaLayers = [];

    // Draw a few individuals from the population (e.g., top 5 or a sample)
    populationToDraw.slice(0, 5).forEach((indData, index) => {
        const ind = indData.individual || indData; // Handle if it's raw individual or {individual, fitness}
        const routeLine = L.polyline(ind.map(p => [p.lat, p.lng]), {
            color: 'rgba(0, 255, 0, 0.3)', // Light green for general population
            weight: 2,
            opacity: 0.5
        }).addTo(gaMap);
        gaLayers.push(routeLine);
    });

    // Highlight the current generation's best route
    if (currentBestRoute) {
         const bestLineThisGen = L.polyline(currentBestRoute.map(p => [p.lat, p.lng]), {
            color: 'cyan', weight: 3, opacity: 0.8
        }).addTo(gaMap);
        gaLayers.push(bestLineThisGen);
    }
    
    // Highlight the overall best route found so far
    if (bestRouteOverall && bestRouteOverall.route) {
         const overallBestLine = L.polyline(bestRouteOverall.route.map(p => [p.lat, p.lng]), {
            color: 'magenta', weight: 4, dashArray: '10, 5'
        }).addTo(gaMap);
        gaLayers.push(overallBestLine);
        // Fit bounds to the overall best route to keep it in view
        // gaMap.fitBounds(overallBestLine.getBounds()); 
        // ^ Be careful with too frequent fitBounds, can be jarring.
        // Only fit bounds if it's significantly different or on first overall best.
    }
}


let fitnessChartInstance = null;
function updateFitnessChart(generation, bestFitnessThisGen, avgFitness) {
    const ctx = document.getElementById('fitness-chart').getContext('2d');
    if (!fitnessChartInstance) {
        fitnessChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], // Generation numbers
                datasets: [
                    {
                        label: '本代最佳适应度',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)', // Cyan
                        tension: 0.1
                    },
                    {
                        label: '平均适应度',
                        data: [],
                        borderColor: 'rgb(255, 159, 64)', // Orange
                        tension: 0.1
                    },
                    {
                        label: '全局最佳适应度',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)', // Pink/Red
                        tension: 0.1,
                        borderDash: [5, 5] // Dashed line for overall best
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: false, // Fitness might not start at 0
                        title: { display: true, text: '适应度值' }
                    },
                    x: {
                        title: { display: true, text: '迭代代数' }
                    }
                },
                animation: { duration: 300 } // Smooth updates
            }
        });
    }
    fitnessChartInstance.data.labels.push(generation);
    fitnessChartInstance.data.datasets[0].data.push(bestFitnessThisGen);
    fitnessChartInstance.data.datasets[1].data.push(avgFitness);
    if (bestRouteOverall) {
        fitnessChartInstance.data.datasets[2].data.push(bestRouteOverall.fitness);
    } else if (fitnessChartInstance.data.datasets[2].data.length > 0) {
        // Keep last known overall best if current is null (shouldn't happen if logic is right)
        fitnessChartInstance.data.datasets[2].data.push(fitnessChartInstance.data.datasets[2].data.slice(-1)[0]);
    } else {
         fitnessChartInstance.data.datasets[2].data.push(bestFitnessThisGen); // First overall best
    }


    fitnessChartInstance.update();
}

async function runGeneticAlgorithm(annotationData, popSize, generations, mutationRate) {
    if (gaRunning) {
        alert("遗传算法已在运行中！");
        return null;
    }
    if(!gaMap) {
        alert("优化地图未初始化，请先切换到优化标签页。");
        initGAMap(); // Try to initialize it
        if(!gaMap) return null; // Still no map
    }

    gaRunning = true;
    currentGenerationNum = 0;
    population = [];
    fitnessHistory = [];
    bestRouteOverall = null; // Reset overall best for this run

    // Update UI elements
    document.getElementById('ga-progress-bar').style.width = '0%';
    document.getElementById('current-generation').textContent = '0';
    document.getElementById('total-generations').textContent = generations;
    document.getElementById('best-fitness').textContent = '计算中...';
    
    // Reset or destroy previous chart instance to start fresh
    if(fitnessChartInstance) {
        fitnessChartInstance.destroy();
        fitnessChartInstance = null;
    }
    // Call updateFitnessChart to initialize it with empty data if needed or let the loop do it.
    updateFitnessChart(0,0,0); // Initialize chart with 0 values

    // Clear previous drawings on GA map and copy constraints
    if (gaMap) {
        gaMap.eachLayer(layer => { 
            // Only remove vector layers, not the tile layer
            if (layer instanceof L.Path || layer instanceof L.Marker) {
                gaMap.removeLayer(layer);
            }
        });
        gaLayers = []; // Clear our record of drawn GA layers

        if (annotationData.startPoint) {
             L.marker([annotationData.startPoint.lat, annotationData.startPoint.lng], {icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25,41], iconAnchor: [12,41]}) }).bindPopup("起点").addTo(gaMap);
        }
        if (annotationData.endPoint) {
             L.marker([annotationData.endPoint.lat, annotationData.endPoint.lng], {icon: L.icon({iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png', iconSize: [25,41], iconAnchor: [12,41]}) }).bindPopup("终点").addTo(gaMap);
        }

        annotationData.constraints.forEach(c => {
            const style = { 
                color: document.querySelector(`#annotation-type option[value="${c.type}"]`)?.dataset.color || '#808080', // Grey default
                weight:1, 
                opacity:0.5, 
                fillOpacity:0.2
            };
            L.geoJSON(c.geojson, {style: style}).addTo(gaMap);
        });
        // Fit map to constraints and start/end points if available
        const boundsForFit = L.featureGroup();
        if(annotationData.startPoint) boundsForFit.addLayer(L.marker([annotationData.startPoint.lat, annotationData.startPoint.lng]));
        if(annotationData.endPoint) boundsForFit.addLayer(L.marker([annotationData.endPoint.lat, annotationData.endPoint.lng]));
        annotationData.constraints.forEach(c => boundsForFit.addLayer(L.geoJSON(c.geojson)));
        if(boundsForFit.getLayers().length > 0) gaMap.fitBounds(boundsForFit.getBounds().pad(0.1)); // Add some padding
    }


    // Initialize population
    for (let i = 0; i < popSize; i++) {
        population.push(createIndividual(annotationData.startPoint, annotationData.endPoint));
    }

    for (let gen = 0; gen < generations; gen++) {
        currentGenerationNum = gen + 1;
        document.getElementById('current-generation').textContent = currentGenerationNum;
        const progressPercent = (currentGenerationNum / generations) * 100;
        document.getElementById('ga-progress-bar').style.width = `${progressPercent}%`;
        document.getElementById('ga-progress-bar').textContent = `${Math.round(progressPercent)}%`;


        let popWithFitness = population.map(ind => ({
            individual: ind,
            fitness: calculateFitness(ind, annotationData.constraints)
        }));

        popWithFitness.sort((a, b) => b.fitness - a.fitness); // Sort descending by fitness

        const bestThisGeneration = popWithFitness[0];

        if (!bestRouteOverall || bestThisGeneration.fitness > bestRouteOverall.fitness) {
            bestRouteOverall = { route: deepClone(bestThisGeneration.individual), fitness: bestThisGeneration.fitness };
        }
        document.getElementById('best-fitness').textContent = bestRouteOverall.fitness.toFixed(6);

        const avgFitness = popWithFitness.reduce((sum, indFitness) => sum + indFitness.fitness, 0) / popWithFitness.length;
        fitnessHistory.push({ gen: currentGenerationNum, best: bestThisGeneration.fitness, avg: avgFitness, overallBest: bestRouteOverall.fitness });
        updateFitnessChart(currentGenerationNum, bestThisGeneration.fitness, avgFitness); // Pass current gen best, not overall

        if (gen % 5 === 0 || gen === generations - 1) { 
           visualizePopulation(popWithFitness, bestThisGeneration.individual);
        }

        // Selection, Crossover, Mutation
        const newPopulation = [];
        if(bestRouteOverall && bestRouteOverall.route) { // Elitism
            newPopulation.push(deepClone(bestRouteOverall.route));
        }

        const selectedParents = selection(popWithFitness);

        while (newPopulation.length < popSize) {
            const parent1Index = Math.floor(Math.random() * selectedParents.length);
            let parent2Index = Math.floor(Math.random() * selectedParents.length);
            // Ensure parent2 is different from parent1 for meaningful crossover
            while (parent2Index === parent1Index && selectedParents.length > 1) {
                 parent2Index = Math.floor(Math.random() * selectedParents.length);
            }
            const parent1 = selectedParents[parent1Index];
            const parent2 = selectedParents[parent2Index];
            
            const [child1, child2] = crossover(parent1, parent2);
            newPopulation.push(mutate(child1, mutationRate));
            if (newPopulation.length < popSize) {
                newPopulation.push(mutate(child2, mutationRate));
            }
        }
        population = newPopulation.slice(0, popSize); // Ensure population size constraint

        if (gen % 10 === 0) { // Yield for UI updates occasionally
             await new Promise(resolve => setTimeout(resolve, 10)); 
        }
    }
    
    visualizePopulation(population.map(ind => ({individual: ind, fitness: calculateFitness(ind, annotationData.constraints)})).sort((a,b) => b.fitness - a.fitness), bestRouteOverall.route); // Final visualization with sorted pop

    gaRunning = false;
    document.getElementById('ga-progress-bar').textContent = `完成!`;
    alert("遗传算法优化完成！最佳路线已在优化地图和3D视图中高亮。");
    console.log("Best route found:", bestRouteOverall);
    
    // Automatically switch to 3D view and display
    const viz3DButton = document.querySelector('.tab-button[data-tab="visualization3d"]');
    if (viz3DButton) {
        viz3DButton.click(); // Activate 3D tab
