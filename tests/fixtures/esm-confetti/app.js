import confetti from 'canvas-confetti';

document.getElementById('btn').addEventListener('click', () => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
  });
});
