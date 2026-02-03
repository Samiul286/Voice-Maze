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
    // Pass exit coordinates to findPath to get an array instead of a Set
    const solutionPath = findPath(maze, width, height, { x: 0, y: 0 }, { x: width - 1, y: height - 1 });

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
    // solutionPath is an array of {x, y}
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

    // Add Doors and Keys
    let doorsPlaced = 0;
    const pathIndices = Array.from({ length: solutionPath.length }, (_, i) => i)
        .filter(i => i > 4 && i < solutionPath.length - 4);

    // Shuffle pathIndices
    for (let i = pathIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathIndices[i], pathIndices[j]] = [pathIndices[j], pathIndices[i]];
    }

    const doors = [];
    for (const idx of pathIndices) {
        if (doorsPlaced >= 2) break;
        const p = solutionPath[idx];

        // Ensure we don't place doors too close to each other on the path
        if (doors.some(d => Math.abs(d.idx - idx) < 5)) continue;

        if (maze[p.y][p.x].type === 'empty') {
            maze[p.y][p.x].type = 'door';
            doors.push({ x: p.x, y: p.y, idx: idx });
            doorsPlaced++;
        }
    }

    // Place one key for each door
    doors.forEach((door, doorIdx) => {
        // Find reachable area BEGINNING from the start, but treating ALL current doors as blocks
        // This ensures the key for door 1 is reachable from start, 
        // and the key for door 2 is reachable from start (which might require passing through door 1 if door 1 is earlier on the path)

        // However, the simplest way to ensure reachability is:
        // Key for door N must be in the area reachable from start when all doors [doorIdx...end] are blocked.
        const currentBlocks = doors.slice(doorIdx).map(d => 'door');
        // Wait, if door 0 is at index 10 and door 1 is at index 20.
        // Key for door 0 must be reachable from start (indices 0-9)
        // Key for door 1 must be reachable from start (indices 0-19), but door 0 might be open.
        // Actually, let's just make it simple: Key for door N must be between the previous door (or start) and door N.

        const blockTypes = ['door', 'trap', 'exit', 'start', 'key'];
        const reachableSet = findPath(maze, width, height, { x: 0, y: 0 }, null, ['door']);
        const availableCells = [];

        for (let ry = 0; ry < height; ry++) {
            for (let rx = 0; rx < width; rx++) {
                if (maze[ry][rx].type === 'empty' && reachableSet.has(`${rx},${ry}`)) {
                    availableCells.push({ x: rx, y: ry });
                }
            }
        }

        if (availableCells.length > 0) {
            const p = availableCells[Math.floor(Math.random() * availableCells.length)];
            maze[p.y][p.x].type = 'key';
            // We don't want to block the second door's reachability check with the first door 
            // if the first door is "open" in our logic.
            // But for placement, we just want to ensure the key is "behind" the door.
            // So we Temporarily "open" this door so the next key can be placed further in if needed.
            maze[door.y][door.x].type = 'empty';
        }
    });

    // Restore door types
    doors.forEach(door => {
        maze[door.y][door.x].type = 'door';
    });
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
