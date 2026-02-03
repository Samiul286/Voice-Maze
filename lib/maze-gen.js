function generateMaze(width, height) {
    const maze = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({
            walls: { top: true, right: true, bottom: true, left: true },
            visited: false,
            type: 'empty' // 'empty', 'trap', 'door', 'exit', 'start'
        }))
    );

    const stack = [];
    const startCell = { x: 0, y: 0 };
    maze[0][0].visited = true;
    maze[0][0].type = 'start';
    stack.push(startCell);

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = getUnvisitedNeighbors(current, maze, width, height);

        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWalls(current, next, maze);
            maze[next.y][next.x].visited = true;
            stack.push(next);
        } else {
            stack.pop();
        }
    }

    // Set Exit
    maze[height - 1][width - 1].type = 'exit';

    // Find solution path to avoid placing traps on it
    const solutionPath = findPath(maze, width, height);

    // Add random traps
    addSpecialTiles(maze, width, height, solutionPath);

    return maze;
}

function getUnvisitedNeighbors(cell, maze, width, height) {
    const { x, y } = cell;
    const neighbors = [];

    if (y > 0 && !maze[y - 1][x].visited) neighbors.push({ x, y: y - 1, dir: 'top' });
    if (x < width - 1 && !maze[y][x + 1].visited) neighbors.push({ x: x + 1, y, dir: 'right' });
    if (y < height - 1 && !maze[y + 1][x].visited) neighbors.push({ x, y: y + 1, dir: 'bottom' });
    if (x > 0 && !maze[y][x - 1].visited) neighbors.push({ x: x - 1, y, dir: 'left' });

    return neighbors;
}

function removeWalls(current, next, maze) {
    const dx = next.x - current.x;
    const dy = next.y - current.y;

    if (dx === 1) {
        maze[current.y][current.x].walls.right = false;
        maze[next.y][next.x].walls.left = false;
    } else if (dx === -1) {
        maze[current.y][current.x].walls.left = false;
        maze[next.y][next.x].walls.right = false;
    } else if (dy === 1) {
        maze[current.y][current.x].walls.bottom = false;
        maze[next.y][next.x].walls.top = false;
    } else if (dy === -1) {
        maze[current.y][current.x].walls.top = false;
        maze[next.y][next.x].walls.bottom = false;
    }
}

function addSpecialTiles(maze, width, height, solutionPath) {
    const solutionSet = new Set(solutionPath.map(p => `${p.x},${p.y}`));

    // Reduced density: 5% of tiles instead of 10%
    for (let i = 0; i < (width * height) / 20; i++) {
        const rx = Math.floor(Math.random() * width);
        const ry = Math.floor(Math.random() * height);

        // Ensure not start area, not exit, and NOT on the solution path
        if (rx + ry < 3) continue;
        if (rx === width - 1 && ry === height - 1) continue;
        if (solutionSet.has(`${rx},${ry}`)) continue;

        if (maze[ry][rx].type === 'empty') {
            maze[ry][rx].type = 'trap';
        }
    }

    // Add Doors and Switches
    // Place 2 Doors on the solution path to block it (ensuring they are relevant)
    let doorsPlaced = 0;
    const pathIndices = Array.from({ length: solutionPath.length }, (_, i) => i).filter(i => i > 2 && i < solutionPath.length - 2);

    // Shuffle path indices
    for (let i = pathIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathIndices[i], pathIndices[j]] = [pathIndices[j], pathIndices[i]];
    }

    for (const idx of pathIndices) {
        if (doorsPlaced >= 2) break;
        const p = solutionPath[idx];
        if (maze[p.y][p.x].type === 'empty') {
            maze[p.y][p.x].type = 'door'; // Locked by default
            doorsPlaced++;
        }
    }

    // Place Switches (Away from solution path implies "exploration needed")
    let switchesPlaced = 0;
    while (switchesPlaced < 2) {
        const rx = Math.floor(Math.random() * width);
        const ry = Math.floor(Math.random() * height);

        if (rx + ry < 3) continue;
        if (rx === width - 1 && ry === height - 1) continue;
        // Allow switches on solution path if needed, but prefer off-path for difficulty? 
        // Let's keep them off-path to force exploration, but ensure they are reachable (assumed true if maze is perfect)
        if (solutionSet.has(`${rx},${ry}`)) continue;

        if (maze[ry][rx].type === 'empty') {
            maze[ry][rx].type = 'switch';
            switchesPlaced++;
        }
    }
}

function findPath(maze, width, height, startCoords = { x: 0, y: 0 }, endCoords = null) {
    if (!endCoords) endCoords = { x: width - 1, y: height - 1 };

    const start = { x: startCoords.x, y: startCoords.y, path: [] };
    const queue = [start];
    const visited = new Set([`${startCoords.x},${startCoords.y}`]);

    while (queue.length > 0) {
        const current = queue.shift();
        const { x, y, path } = current;
        const newPath = [...path, { x, y }];

        if (x === endCoords.x && y === endCoords.y) {
            return newPath;
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
                !cell.walls[wall] && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`);
                queue.push({ x: nx, y: ny, path: newPath });
            }
        }
    }
    return []; // No path found
}

module.exports = { generateMaze, findPath };
