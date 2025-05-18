// Simplified Genetic Algorithm
let gaMap; // For displaying GA progress on a smaller map
let population = [];
let bestRouteOverall = null;
let fitnessHistory = [];
let currentGeneration = 0;
let gaRunning = false;

const INTERMEDIATE_POINTS = 5; // Number of intermediate points in a route

function initGAMap() {
    gaMap = L.map('map-optimization').setView([30.5, 114.3], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(gaMap);
}

function createIndividual(startPoint, endPoint) {
    const route = [startPoint];
    const latDiff = endPoint.lat - startPoint.lat;
    const lngDiff = endPoint.lng - startPoint.lng;

    for (let i = 0; i < INTERMEDIATE_POINTS; i++) {
        // Initial points roughly along the straight line + some randomness
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
        // Check intersections with constraint polygons
        constraints.forEach(constraint => {
            // For simplicity, check if any segment of the route intersects the constraint polygon's bounding box
            // A proper implementation requires robust line-polygon intersection (e.g., using Turf.js)
            const constraintLayer = L.geoJSON(constraint.geojson); // Create a temporary Leaflet layer to use its methods
            if (constraintLayer.getBounds && routeSegmentIntersectsBounds(route[i], route[i+1], constraintLayer.getBounds())) {
                 // Crude intersection check: if any point of the route is inside the polygon
                if (isPointInPolygon(route[i+1], constraintLayer.getLayers()[0].getLatLngs()[0])) {
                    penalty += Math.abs(constraint.weight) * (constraint.weight > 0 ? 1 : -0.5) ; // Attractors give "negative" penalty
                }
            }
        });
    }
    // Fitness: higher is better. We want to minimize length and penalty (for positive weights).
    // Add a small epsilon to avoid division by zero if length and penalty are 0.
    return 1 / (totalLength + penalty * 10 + 0.0001); // Penalty scaled up
}
// Simplified BBox check for demo
function routeSegmentIntersectsBounds(p1, p2, bounds) {
    return bounds.intersects(L.latLngBounds(p1, p2));
}


function selection(popWithFitness) {
    // Tournament selection
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
        selected.push(bestInTournament.individual);
    }
    return selected;
}

function crossover(parent1, parent2) {
    // Single point crossover for intermediate points
    const child1 = [parent1[0]]; // Start point
    const child2 = [parent2[0]];
    const crossoverPoint = Math.floor(Math.random() * (INTERMEDIATE_POINTS -1)) + 1;

    for (let i = 1; i <= INTERMEDIATE_POINTS; i++) {
        if (i < crossoverPoint) {
            child1.push(deepClone(parent1[i]));
            child2.push(deepClone(parent2[i]));
        } else {
            child1.push(deepClone(parent2[i]));
            child2.push(deepClone(parent1[i]));
        }
    }
    child1.push(parent1[parent1.length - 1]); // End point
    child2.push(parent2[parent2.length - 1]);
    return [child1, child2];
}

function mutate(individual, mutationRate) {
    const mutatedIndividual = [individual[0]]; // Keep start point
    for (let i = 1; i <= INTERMEDIATE_POINTS; i++) {
        if (Math.random() < mutationRate) {
            // Simple mutation: slightly alter lat/lng
            mutatedIndividual.push({
                lat: individual[i].lat + (Math.random() - 0.5) * 0.5, // Adjust mutation strength
                lng: individual[i].lng + (Math.random() - 0.5) * 0.5
            });
        } else {
            mutatedIndividual.push(deepClone(individual[i]));
        }
    }
    mutatedIndividual.push(individual[individual.length - 1]); // Keep end point
    return mutatedIndividual;
}


let gaLayers = [];
function visualizePopulation(populationToDraw) {
    gaLayers.forEach(layer => gaMap.removeLayer(layer));
    gaLayers = [];

    populationToDraw.slice(0, 10).forEach((ind, index) => { // Draw top 10
        const routeLine = L.polyline(ind.map(p => [p.lat, p.lng]), {
            color: index === 0 ? 'cyan' : 'rgba(0, 255, 0, 0.3)', // Highlight best
            weight: index === 0 ? 4 : 2
        }).addTo(gaMap);
        gaLayers.push(routeLine);
    });
    if (bestRouteOverall) {
         const bestLine = L.polyline(bestRouteOverall.route.map(p => [p.lat, p.lng]), {
            color: 'magenta', weight: 5, dashArray: '10, 5'
        }).addTo(gaMap);
        gaLayers.push(bestLine);
        gaMap.fitBounds(bestLine.getBounds());
    }
}


let fitnessChartInstance = null;
function updateFitnessChart(generation, bestFitness, avgFitness) {
    const ctx = document.getElementById('fitness-chart').getContext('2d');
    if (!fitnessChartInstance) {
        fitnessChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Best Fitness',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1
                    },
                    {
                        label: 'Average Fitness',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: false } }
            }
        });
    }
    fitnessChartInstance.data.labels.push(generation);
    fitnessChartInstance.data.datasets[0].data.push(bestFitness);
    fitnessChartInstance.data.datasets[1].data.push(avgFitness);
    fitnessChartInstance.update();
}

async function runGeneticAlgorithm(annotationData, popSize, generations, mutationRate) {
    if (gaRunning) {
        console.log("GA already running.");
        return;
    }
    gaRunning = true;
    currentGeneration = 0;
    population = [];
    fitnessHistory = [];
    bestRouteOverall = null;

    document.getElementById('ga-progress-bar').style.width = '0%';
    document.getElementById('current-generation').textContent = '0';
    document.getElementById('total-generations').textContent = generations;
    document.getElementById('best-fitness').textContent = 'N/A';
    if(fitnessChartInstance) fitnessChartInstance.destroy();
    fitnessChartInstance = null; // Reset chart

    // Copy constraint layers to GA map for visualization
    gaMap.eachLayer(layer => { if (layer !== gaMap && !layer._url) gaMap.removeLayer(layer); }); // Clear previous drawings except tile
    annotationData.constraints.forEach(c => {
        const style = { color: document.querySelector(`#annotation-type option[value="${c.type}"]`).dataset.color || '#ccc', weight:1, opacity:0.5, fillOpacity:0.2};
        L.geoJSON(c.geojson, {style: style}).addTo(gaMap);
    });


    // Initialize population
    for (let i = 0; i < popSize; i++) {
        population.push(createIndividual(annotationData.startPoint, annotationData.endPoint));
    }

    for (let gen = 0; gen < generations; gen++) {
        currentGeneration = gen + 1;
        document.getElementById('current-generation').textContent = currentGeneration;
        document.getElementById('ga-progress-bar').style.width = `${(currentGeneration / generations) * 100}%`;


        // Calculate fitness
        let popWithFitness = population.map(ind => ({
            individual: ind,
            fitness: calculateFitness(ind, annotationData.constraints)
        }));

        // Sort by fitness (descending)
        popWithFitness.sort((a, b) => b.fitness - a.fitness);

        if (!bestRouteOverall || popWithFitness[0].fitness > bestRouteOverall.fitness) {
            bestRouteOverall = { route: deepClone(popWithFitness[0].individual), fitness: popWithFitness[0].fitness };
        }
        document.getElementById('best-fitness').textContent = bestRouteOverall.fitness.toFixed(6);

        const avgFitness = popWithFitness.reduce((sum, ind) => sum + ind.fitness, 0) / popWithFitness.length;
        fitnessHistory.push({ gen: currentGeneration, best: bestRouteOverall.fitness, avg: avgFitness });
        updateFitnessChart(currentGeneration, bestRouteOverall.fitness, avgFitness);


        // Visualize (e.g., top 10 routes)
        if (gen % 5 === 0 || gen === generations - 1) { // Update visualization periodically
           visualizePopulation(popWithFitness.map(p => p.individual));
        }

        // Create new population
        const newPopulation = [bestRouteOverall.route]; // Elitism: keep the best

        const selectedParents = selection(popWithFitness);

        for (let i = 0; i < (popSize - 1) / 2; i++) { // -1 for elitism
            const parent1 = selectedParents[Math.floor(Math.random() * selectedParents.length)];
            const parent2 = selectedParents[Math.floor(Math.random() * selectedParents.length)];
            const [child1, child2] = crossover(parent1, parent2);
            newPopulation.push(mutate(child1, mutationRate));
            if (newPopulation.length < popSize) {
                newPopulation.push(mutate(child2, mutationRate));
            }
        }
        population = newPopulation.slice(0, popSize);

        // Yield for UI updates if running many generations
        if (gen % 10 === 0) {
             await new Promise(resolve => setTimeout(resolve, 0)); // Allow browser to repaint
        }
    }
    gaRunning = false;
    alert("遗传算法优化完成！最佳路线已在优化地图和3D视图中高亮。");
    console.log("Best route found:", bestRouteOverall);
    // Automatically switch to 3D view and display
    document.querySelector('.tab-button[data-tab="visualization3d"]').click();
    displayRouteIn3D(bestRouteOverall.route, annotationData.constraints);
    return bestRouteOverall;
}
