class Logger {
    static info(msg) { console.log(`ℹ️ ${msg}`); }
    static success(msg) { console.log(`✅ ${msg}`); }
    static warning(msg) { console.log(`⚠️ ${msg}`); }
    static error(msg) { console.error(`❌ ${msg}`); }
}

class DependencyLoader {
    static async load() {
        Logger.info('Iniciando carregamento de dependências...');
        updateLoaderStatus('Carregando dependências...');

        const dependencies = [
            { src: 'renderer.js', name: 'GameRenderer', isEssential: true },
            { src: 'visual-effects.js', name: 'VisualEffects', isEssential: false },
            { src: 'spectator-mode.js', name: 'SpectatorMode', isEssential: false },
            { src: 'game-logic.js', name: 'Runner', isEssential: true },
            { src: 'client.js', name: null, isEssential: true },
            { src: 'index.js', name: null, isEssential: false }
        ];

        try {
            for (const dep of dependencies) {
                updateLoaderStatus(`Carregando ${dep.src}...`);
                await this.loadScript(dep);
                Logger.success(`${dep.src} carregado.`);
                if (dep.name && !window[dep.name]) {
                    throw new Error(`${dep.name} não foi definido após carregar ${dep.src}`);
                }
            }
            
            Logger.success('🎉 Todas as dependências foram carregadas.');
            updateLoaderStatus('Dependências carregadas.');
            this.startApplication();
        } catch (error) {
            console.error('Erro no carregamento de dependências:', error);
            Logger.error(`Erro no carregamento de dependências: ${error?.message || error}`);
            this.showErrorScreen(error);
        }
    }

    static loadScript(dep) {
        return new Promise((resolve, reject) => {
            if (dep.name && window[dep.name]) return resolve();

            const script = document.createElement('script');
            script.src = dep.src;
            script.async = false;
            
            script.onload = () => {
                if (!dep.name) {
                    resolve();
                } else {
                    // Aumentar timeout e adicionar polling
                    const checkInterval = 100;
                    const maxAttempts = 50; // 5 segundos no total
                    let attempts = 0;

                    const checkForClass = () => {
                        attempts++;
                        if (window[dep.name]) {
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            reject(new Error(`${dep.name} não disponível após carregar ${dep.src}`));
                        } else {
                            setTimeout(checkForClass, checkInterval);
                        }
                    };
                    checkForClass();
                }
            };
            
            script.onerror = () => {
                reject(new Error(`Falha ao carregar ${dep.src}`));
            };
            
            document.head.appendChild(script);
        });
    }

    static startApplication() {
        const required = ['GameRenderer', 'Runner'];
        const recommended = ['VisualEffects', 'SpectatorMode'];
        
        const missingRequired = required.filter(cls => !window[cls]);
        const missingRecommended = recommended.filter(cls => !window[cls]);
        
        if (missingRequired.length > 0) {
            console.error(`Classes essenciais faltando: ${missingRequired.join(', ')}`);
            throw new Error(`Classes essenciais faltando: ${missingRequired.join(', ')}`);
        }
        
        if (missingRecommended.length > 0) {
            console.warn(`Classes recomendadas faltando: ${missingRecommended.join(', ')}`);
        }
        
        console.log('🚀 Disparando allScriptsLoaded');
        const event = new Event('allScriptsLoaded');
        window.dispatchEvent(event);
    }

    static showErrorScreen(error) {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.innerHTML = `
                <div style="color: white; text-align: center;">
                    <h2>Erro ao carregar o jogo</h2>
                    <p>${error.message}</p>
                    <p>Detalhes: ${error.stack || 'Nenhum detalhe adicional'}</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
                        Recarregar Agora
                    </button>
                </div>
            `;
        }
    }

    static async preloadAssets() {
        const assets = [
            'assets/offline-sprite-1x.png',
            'assets/offline-sprite-2x.png'
        ];
        
        await Promise.all(assets.map(src => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = resolve;
                img.onerror = () => {
                    console.warn(`Failed to load asset: ${src}`);
                    resolve(); // Não falha mesmo se o asset não carregar
                };
            });
        }));
    }
}

window.allScriptsLoadedHandled = false;

// Inicialização com tratamento de erro global
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado - iniciando loader');

    // Iniciar carregamento
    DependencyLoader.load().catch(error => {
        console.error('Erro fatal no loader:', error);
    });
});

window.addEventListener('allScriptsLoaded', () => {
    window.allScriptsLoadedHandled = true;
    console.log('Evento allScriptsLoaded capturado - jogo pronto para iniciar');
});

// Adicionar fallback para caso o loader falhe silenciosamente
setTimeout(() => {
    if (!window.allScriptsLoadedHandled && document.getElementById('loader')) {
        console.warn('Fallback: Verificando manualmente após timeout');
        const missing = ['GameRenderer', 'Runner'].filter(cls => !window[cls]);
        
        if (missing.length === 0) {
            console.warn('Forçando allScriptsLoaded');
            window.dispatchEvent(new Event('allScriptsLoaded'));
        } else {
            console.error('Classes ainda faltando:', missing);
            document.getElementById('loader').innerHTML = `
                <div style="color: white; text-align: center;">
                    <h2>Falha no carregamento</h2>
                    <p>Classes faltando: ${missing.join(', ')}</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
                        Tentar Novamente
                    </button>
                </div>
            `;
        }
    }
}, 10000); // 10 segundos de timeout