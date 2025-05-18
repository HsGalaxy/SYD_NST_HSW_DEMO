document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('app-loader');
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Initialize maps after a short delay to allow loader to show
    // setTimeout(() => { // No longer needed if loader hides after init
        try {
            initAnnotationMap();
            initGAMap(); // Initialize GA map (can be deferred until tab is clicked)
            // init3DMap(); // Defer 3D map initialization until its tab is clicked to save resources
        } catch (error) {
            console.error("Error initializing maps:", error);
            alert("地图初始化失败，请检查浏览器控制台获取更多信息。");
        } finally {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500); // Hide after fade
        }
    // }, 100);


    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetTab = tab.dataset.tab;
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                    if (targetTab === 'visualization3d' && !cesiumViewer) {
                        init3DMap(); // Initialize 3D map when tab is first opened
                    }
                }
            });
        });
    });

    document.getElementById('run-ga').addEventListener('click', async () => {
        const annotationData = getAnnotationData();
        if (!annotationData) return;

        const popSize = parseInt(document.getElementById('population-size').value);
        const generations = parseInt(document.getElementById('generations').value);
        const mutationRate = parseFloat(document.getElementById('mutation-rate').value);

        if (isNaN(popSize) || isNaN(generations) || isNaN(mutationRate) || popSize <=0 || generations <=0 || mutationRate <0) {
            alert("请输入有效的遗传算法参数！");
            return;
        }

        // Switch to optimization tab if not already there
        document.querySelector('.tab-button[data-tab="optimization"]').click();

        const bestRoute = await runGeneticAlgorithm(annotationData, popSize, generations, mutationRate);
        // The runGeneticAlgorithm function now handles displaying the route in 3D after completion
    });
});
