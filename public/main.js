// Variáveis de estado globais
window.gameLoaded = false;
window.userLoggedIn = false;

function initializeGame() {
    console.log('Inicializando o jogo...');
    
    // Esconde a tela de login e o loader
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
        loginContainer.style.display = 'none';
    }

    // Mostra o contêiner do jogo
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    }

    // Inicia o jogo
    if (typeof window.Runner !== 'undefined') {
        window.gameRunner = new window.Runner('#game-container');
        console.log('Jogo inicializado com sucesso');
    } else {
        console.error('Runner não disponível');
    }
}

// Adiciona listeners para os eventos personalizados
window.addEventListener('allScriptsLoaded', () => {
    console.log('Evento allScriptsLoaded recebido em main.js');
    window.gameLoaded = true;
    if (window.userLoggedIn) {
        initializeGame();
    }
});

window.addEventListener('userAuthenticated', () => {
    console.log('Evento userAuthenticated recebido em main.js');
    window.userLoggedIn = true;
    if (window.gameLoaded) {
        initializeGame();
    }
});