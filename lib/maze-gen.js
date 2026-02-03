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

        if (rx + ry < 3) continue;
        if (rx === width - 1 && ry === height - 1) continue;
        if (solutionSet.has(`${rx},${ry}`)) continue;

        if (maze[ry][rx].type === 'empty') {
            maze[ry][rx].type = 'trap';
        }
    }

    // Add Doors
    let doorsPlaced = 0;
    const pathIndices = Array.from({ length: solutionPath.length }, (_, i) => i).filter(i => i > 2 && i < solutionPath.length - 2);

    for (let i = pathIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathIndices[i], pathIndices[j]] = [pathIndices[j], pathIndices[i]];
    }

    for (const idx of pathIndices) {
        if (doorsPlaced >= 2) break;
        const p = solutionPath[idx];
        if (maze[p.y][p.x].type === 'empty') {
            maze[p.y][p.x].type = 'door';
            doorsPlaced++;
        }
    }

    // Identify reachable area without passing through doors
    const reachableSet = findPath(maze, width, height, { x: 0, y: 0 }, null, ['door']);
    const reachableCells = [];
    const unreachableCells = [];

    for (let ry = 0; ry < height; ry++) {
        for (let rx = 0; rx < width; rx++) {
            if (maze[ry][rx].type === 'empty') {
                if (reachableSet.has(`${rx},${ry}`)) reachableCells.push({ x: rx, y: ry });
                else unreachableCells.push({ x: rx, y: ry });
            }
        }
    }

    // Place Switches
    let switchesPlaced = 0;

    // 1. Ensure at least one switch is reachable immediately
    if (reachableCells.length > 0) {
        const p = reachableCells[Math.floor(Math.random() * reachableCells.length)];
        maze[p.y][p.x].type = 'switch';
        switchesPlaced++;
        // Remove from reachableCells so we don't place another one in the same spot
        reachableCells.splice(reachableCells.indexOf(p), 1);
    }

    // 2. Place remaining switches
    const allAvailable = [...reachableCells, ...unreachableCells];
    while (switchesPlaced < 2 && allAvailable.length > 0) {
        const idx = Math.floor(Math.random() * allAvailable.length);
        const p = allAvailable[idx];
        maze[p.y][p.x].type = 'switch';
        switchesPlaced++;
        allAvailable.splice(idx, 1);
    }
}

function findPath(maze, width, height, startCoords = { x: 0, y: 0 }, endCoords = null, blockTypes = []) {
    const start = { x: startCoords.x, y: startCoords.y, path: [] };
    const queue = [start];
    const visited = new Set([`${startCoords.x},${startCoords.y}`]);

    while (queue.length > 0) {
        const current = queue.shift();
        const { x, y, path } = current;
        const newPath = [...path, { x, y }];

        if (endCoords && x === endCoords.x && y === endCoords.y) {
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

                const nextCell = maze[ny][nx];
                if (blockTypes.includes(nextCell.type)) continue;

                visited.add(`${nx},${ny}`);
                queue.push({ x: nx, y: ny, path: newPath });
            }
        }
    }
    return endCoords ? [] : visited; // If no endCoords, return all reachable cells
}

module.exports = { generateMaze, findPath };
