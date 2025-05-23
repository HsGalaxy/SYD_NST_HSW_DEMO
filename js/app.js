document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('app-loader');
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    let gaMapInitialized = false; // Flag to check if GA map has been initialized
    let annotationMapInitialized = false; // Flag for annotation map (though it's init early)
    let cesiumMapInitialized = false; // Flag for Cesium map

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

    document.getElementById('run-ga').addEventListener('click', async () => {
        const annotationData = getAnnotationData();
        if (!annotationData) {
            alert("Please complete the annotation and set the start/end points on the 'Smart Annotation' tab first.");
            return;
        }

        // Ensure GA map is initialized before running GA
        if (!gaMapInitialized) {
             // If user directly clicks "Run GA" without visiting the tab first (e.g. via code)
            const optimizationTabButton = document.querySelector('.tab-button[data-tab="optimization"]');
            if(optimizationTabButton) optimizationTabButton.click(); // Simulate tab click to initialize map

            // Wait a moment for map to initialize if it was just triggered
            await new Promise(resolve => setTimeout(resolve, 100));

            if(!gaMapInitialized) { // Still not initialized, something is wrong
                alert("Optimization map failed to initialize. Please switch to the 'Algorithm Optimization' tab first.");
                return;
            }
        }


        const popSize = parseInt(document.getElementById('population-size').value);
        const generations = parseInt(document.getElementById('generations').value);
        const mutationRate = parseFloat(document.getElementById('mutation-rate').value);

        if (isNaN(popSize) || isNaN(generations) || isNaN(mutationRate) || popSize <=0 || generations <=0 || mutationRate <0) {
            alert("Please enter valid genetic algorithm parameters!");
            return;
        }

        // Switch to optimization tab view if not already there (visual feedback)
        const optimizationTabButton = document.querySelector('.tab-button[data-tab="optimization"]');
        if (optimizationTabButton && !optimizationTabButton.classList.contains('active')) {
            optimizationTabButton.click();
        }
        
        // Ensure the GA map view is updated if it was initialized hidden
        if (gaMap) {
            setTimeout(() => {
                gaMap.invalidateSize();
            }, 0);
        }


        const bestRoute = await runGeneticAlgorithm(annotationData, popSize, generations, mutationRate);
        if (bestRoute) {
             // The runGeneticAlgorithm function now handles displaying the route in 3D after completion
            console.log("GA finished, best route:", bestRoute);
        } else {
            console.log("GA did not return a best route or was cancelled.");
        }
    });
});
