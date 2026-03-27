let lastClicked = null;

document.addEventListener("click", (e) => {
    if (e.target.matches("input, textarea")) {
        lastClicked = e.target;
    }
});

window.getLastClickedInput = () => lastClicked;