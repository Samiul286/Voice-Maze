const { generateMaze } = require('./maze-gen');

function hasSolutionPathWithoutTraps(maze, width, height) {
    const start = { x: 0, y: 0 };
    const queue = [start];
    const visited = new Set(['0,0']);

    while (queue.length > 0) {
        const { x, y } = queue.shift();

        if (x === width - 1 && y === height - 1) {
            return true;
        }

        const cell = maze[y][x];
        const directions = [
            { dx: 0, dy: -1, wall: 'top' },
            { dx: 1, dy: 0, wall: 'right' },
            { dx: 0, dy: 1, wall: 'bottom' },
            { dx: -1, dy: 0, wall: 'left' }
        ];

        for (const { dx, dy, wall } of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
                !cell.walls[wall] &&
                !visited.has(`${nx},${ny}`) &&
                maze[ny][nx].type !== 'trap') {
                visited.add(`${nx},${ny}`);
                queue.push({ x: nx, y: ny });
            }
        }
    }
    return false;
}

const ITERATIONS = 100;
let successes = 0;

for (let i = 0; i < ITERATIONS; i++) {
    const maze = generateMaze(15, 15);
    if (hasSolutionPathWithoutTraps(maze, 15, 15)) {
        successes++;
    } else {
        console.error(`Maze ${i} is unsolvable!`);
    }
}

console.log(`Verification completed: ${successes}/${ITERATIONS} mazes are solvable.`);
if (successes === ITERATIONS) {
    process.exit(0);
} else {
    process.exit(1);
}
