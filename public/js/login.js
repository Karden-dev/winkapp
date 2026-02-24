// js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = '/api';

    // --- RÉFÉRENCES DOM ---
    const pinInputs = document.querySelectorAll('.pin-input');
    const hiddenPinInput = document.getElementById('pin');
    const loginForm = document.getElementById('login-form');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const spinner = submitButton.querySelector('.spinner-border');
    const loginMessage = document.getElementById('login-message');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const phoneNumberInput = document.getElementById('phoneNumber');

    // --- FONCTIONS UTILITAIRES ---

    /**
     * Affiche un message de feedback à l'utilisateur.
     * @param {string} message - Le message à afficher.
     * @param {string} [type='error'] - Le type de message ('error' ou 'success').
     */
    const showMessage = (message, type = 'error') => {
        loginMessage.textContent = message;
        loginMessage.className = `login-feedback d-block ${type === 'success' ? 'success' : 'error'}`;
    };

    /**
     * Masque le message de feedback.
     */
    const hideMessage = () => {
        loginMessage.classList.add('d-none');
    };

    /**
     * Met à jour le champ caché 'pin' avec la valeur agrégée des inputs de PIN.
     */
    const updateHiddenPin = () => {
        hiddenPinInput.value = Array.from(pinInputs).map(input => input.value).join('');
    };

    /**
     * Réinitialise l'état des inputs PIN (bordures, classes).
     */
    const resetPinState = () => {
        pinInputs.forEach(input => {
            input.classList.remove('error', 'filled');
            input.value = '';
        });
        hiddenPinInput.value = '';
    };

    // --- LOGIQUE DE SAISIE PIN ---

    /**
     * Configure la navigation et la saisie des champs PIN.
     */
    const setupPinInputs = () => {
        pinInputs.forEach((input, index) => {

            const inputHandler = function() {
                this.classList.remove('error');

                if (this.value.length === 1) {
                    this.classList.add('filled');
                    if (index < pinInputs.length - 1) {
                        pinInputs[index + 1].focus();
                    }
                } else {
                    this.classList.remove('filled');
                }
                updateHiddenPin();
            };

            input.addEventListener('input', inputHandler);

            input.addEventListener('keyup', function(e) {
                if (e.key === 'Backspace' && this.value === '' && index > 0) {
                    this.classList.remove('filled');
                    pinInputs[index - 1].focus();
                    updateHiddenPin();
                }
            });

            input.addEventListener('keydown', function(e) {
                if (e.key === 'ArrowLeft' && index > 0) {
                    pinInputs[index - 1].focus();
                } else if (e.key === 'ArrowRight' && index < pinInputs.length - 1) {
                    pinInputs[index + 1].focus();
                }
            });

            input.addEventListener('paste', function(e) {
                e.preventDefault();
                const pasteData = e.clipboardData.getData('text').slice(0, 4);

                for (let i = 0; i < pasteData.length; i++) {
                    if (index + i < pinInputs.length) {
                        pinInputs[index + i].value = pasteData[i];
                        pinInputs[index + i].classList.add('filled');
                        pinInputs[index + i].classList.remove('error');
                    }
                }

                const lastFilledIndex = index + pasteData.length - 1;
                if (lastFilledIndex < pinInputs.length - 1) {
                    pinInputs[lastFilledIndex + 1].focus();
                } else {
                    pinInputs[pinInputs.length - 1].focus();
                }

                updateHiddenPin();
            });
        });

        phoneNumberInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                pinInputs[0].focus();
            }
        });
    };

    // --- LOGIQUE DE CONNEXION ---

    /**
     * Gère la soumission du formulaire de connexion.
     * @param {Event} e - L'événement de soumission.
     */
    const handleLoginSubmit = async (e) => {
        e.preventDefault();

        hideMessage();
        spinner.classList.remove('d-none');
        submitButton.disabled = true;

        updateHiddenPin();
        const pin = hiddenPinInput.value;

        if (pin.length !== 4) {
            showMessage('Veuillez entrer un code PIN à 4 chiffres.');
            spinner.classList.add('d-none');
            submitButton.disabled = false;
            pinInputs.forEach(input => input.classList.add('error'));
            loginForm.classList.add('shake');
            setTimeout(() => {
                loginForm.classList.remove('shake');
            }, 1000);
            return;
        }

        const phoneNumber = phoneNumberInput.value;

        try {
            const response = await axios.post(`${API_BASE_URL}/login`, { phoneNumber, pin });

            if (response.status === 200) {
                const storage = rememberMeCheckbox.checked ? localStorage : sessionStorage;
                
                // ✅ MISE À JOUR : Stockage du token et des informations utilisateur
                storage.setItem('token', response.data.token);
                storage.setItem('user', JSON.stringify(response.data.user));

                showMessage('Connexion réussie ! Redirection...', 'success');

                // ✅ MISE À JOUR : Redirection basée sur le rôle
                const user = response.data.user;
                if (user.role === 'livreur') {
                    window.location.href = 'rider-today.html';
                } else if (user.role === 'admin' || user.role === 'manager') {
                    window.location.href = 'dashboard.html';
                } else {
                    // Redirection par défaut si le rôle n'est pas reconnu
                    window.location.href = 'index.html';
                }
            }
        } catch (error) {
            spinner.classList.add('d-none');
            submitButton.disabled = false;

            const message = error.response?.data?.message || 'Identifiants incorrects ou erreur inattendue.';
            showMessage(message);

            pinInputs.forEach(input => input.classList.add('error'));
            loginForm.classList.add('shake');
            setTimeout(() => {
                loginForm.classList.remove('shake');
            }, 1000);
        }
    };

    // --- INITIALISATION ---
    setupPinInputs();
    loginForm.addEventListener('submit', handleLoginSubmit);
});