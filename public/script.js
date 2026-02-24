document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const phoneNumber = document.getElementById('phoneNumber').value;
    const pin = document.getElementById('pin').value;

    try {
        const response = await axios.post('/api/users/login', {
             phone_number: phoneNumber,
             pin: pin
         });

        // Si la connexion réussit, afficher un message de succès
        alert(response.data.message);

        // Redirection vers le tableau de bord (URL à définir plus tard)
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Erreur de connexion:', error);
        // Gérer les erreurs et afficher un message à l'utilisateur
        if (error.response) {
            alert(error.response.data.message || 'Erreur lors de la connexion.');
        } else {
            alert('Erreur réseau. Veuillez réessayer.');
        }
    }
});