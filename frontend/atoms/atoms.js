EPSILON = 1e-8;
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    dist2(other) {
        return (this.x - other.x)*(this.x - other.x) + (this.y - other.y)*(this.y - other.y);
    }
    dist(other) {
        return Math.sqrt(this.dist2(other));
    }
    copy() {
        return new Point(this.x, this.y, this.isCorner);
    }
    plus(other) {
        return new Point(this.x + other.x, this.y + other.y);
    }
    minus(other) {
        return new Point(this.x - other.x, this.y - other.y);
    }
    multiply(factor) {
        return new Point(this.x * factor, this.y * factor);
    }
    divide(factor) {
        return new Point(this.x / factor, this.y / factor);
    }
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }
    rotate(theta) {
        return new Point(
            Math.cos(theta) * this.x - Math.sin(theta) * this.y,
            Math.sin(theta) * this.x + Math.cos(theta) * this.y,
        );
    }
    magnitude2() {
        return this.x * this.x + this.y * this.y;
    }
    magnitude() {
        return Math.sqrt(this.magnitude2());
    }
    limit(mag) {
        if (this.magnitude() > mag) {
            return this.normalize(mag);
        } else {
            return this.copy();
        }
    }
    normalize(scale = 1) {
        let mag = this.magnitude();
        if (Math.abs(mag) < EPSILON) {
            return new Point(0, scale);
        } else {
            return this.multiply(scale / mag);
        }
    }
}

window.onload = () => {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');

    const pitch = 50;

    let bodies = [];
    function initBodies() {
        bodies = [];
        for (let i = 4; i <= 5; i++) {
            for (let j = 4; j <= 5; j++) {
                //if(i == 4 && j == 5) continue;
                if(i == 4 && j == 4) continue;
                bodies.push(new Point(i * pitch, j * pitch));
            }
        }
    }
    initBodies();

    // Get a gaussian force, for a given difference vector
    function getGaussianForce(diff, inflection) {
        let r2 = diff.magnitude2();
        let mult = -2 * Math.exp(-r2 / inflection / inflection) / inflection;
        const max = Math.sqrt(2 / Math.E);
        return diff.multiply(mult / max);
    }

    const maxSpeed = 30;

    function getSingleForceOld(pos, a, mult) {
        let diff = pos.minus(a);
        let dist = diff.magnitude();
        if (dist < EPSILON) {
            diff = new Point(0, 1);
        }
        const maxDist = pitch;
        if (dist < maxDist) {
            const cutoffDist = 2*pitch;
            if (dist > cutoffDist) {
                return new Point(0, 0);
            }
            let power = Math.pow(Math.max(1 - dist / (maxDist), 0), 1);
            let resistiveForce = diff.normalize().multiply(power * maxSpeed * mult);
            return resistiveForce.limit(maxSpeed);
        } else {
            let attractivePower = 1-Math.min(Math.abs(dist/maxDist - 1.5), 0.5)/0.5;
            let attractiveForce = diff.normalize().multiply(-attractivePower*maxSpeed/8);
            return attractiveForce;
        }
        let totalForce = resistiveForce.plus(attractiveForce);
        totalForce = totalForce.limit(maxSpeed);
        return totalForce;
    }

    function getLennardJones(epsilon, sigma, dist) {
        return epsilon*Math.pow(sigma/dist, 7)/dist * (Math.pow(sigma/dist, 6)-1);
    }

    function getSingleForce(pos, a, mult) {
        let diff = pos.minus(a);
        let dist = diff.magnitude();
        if (dist < EPSILON) {
            diff = new Point(0, 1);
            dist = EPSILON;
        }
        const targetRadius = pitch;
        const epsilon = 300*maxSpeed;
        let force = Math.min(getLennardJones(epsilon, targetRadius, dist), 3*maxSpeed);
        return diff.normalize(force);
    }

    function getSegmentForceOld(pos, a, b, bodies) {
        const dist = a.dist(b);
        const effect = Math.pow(1 - Math.min(Math.abs(pitch - dist) / pitch, 1), 4);
        const inflection = pitch * 1 / 2;
        if (effect < EPSILON) {
            return new Point(0, 0);
        }
        const norm = b.minus(a).rotate(Math.PI / 2).normalize(pitch);
        const offsets = [
            [a.plus(norm), 1, 1],
            [a.minus(norm), 1, 1],
            [b.plus(norm), 1, 1],
            [b.minus(norm), 1, 1],
            //[a, -1, 0],
        ];
        let force = new Point(0, 0);
        for (let [offset, weight, pauliWeight] of offsets) {
            let closestBodyDist = pitch / 2;
            for (let body of bodies) {
                let bodyDist = body.dist(offset);
                closestBodyDist = Math.min(closestBodyDist, bodyDist);
            }
            let diff = pos.minus(offset);
            let offsetForce = getGaussianForce(diff, inflection);
            let pauliEffect = 1 - (pitch / 2 - closestBodyDist) / (pitch / 2);
            pauliEffect = pauliWeight * pauliEffect + (1 - pauliWeight) * 1;
            force = force.plus(offsetForce.multiply(maxSpeed * weight * effect * pauliEffect));
        }
        return force;
    }

    function getSegmentForce(pos, a, b, bodies) {
        let ab = b.minus(a);
        let norm = ab.rotate(Math.PI/2).normalize();
        let abMid = a.plus(b).divide(2);
        let offsets = [
            abMid.plus(norm.multiply(pitch/2)),
            abMid.plus(norm.multiply(-pitch/2)),
        ];
        const effect = Math.pow(1 - Math.min(Math.abs(pitch - ab.magnitude()) / pitch, 1), 5);

        const cap = 4*maxSpeed;
        let totalForce = new Point(0, 0);
        for(let offset of offsets) {
            let diff = pos.minus(offset);
            let dist = diff.magnitude();
            if (dist < EPSILON) {
                diff = new Point(0, 1);
                dist = EPSILON;
            }
            const targetRadius = pitch;
            const epsilon = 50*maxSpeed;
            let force = Math.max(Math.min(getLennardJones(epsilon, targetRadius*Math.sqrt(2)/2, dist), 2*cap), 0);

            ctx.save();
            ctx.fillStyle = 'purple';
            ctx.beginPath();
            ctx.arc(offset.x, offset.y, effect*5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            totalForce = totalForce.plus(diff.normalize(force));
        }
        totalForce = totalForce.limit(cap*effect);

        return totalForce;
    }

    function drawArrow(fromx, fromy, tox, toy) {
        var dx = tox - fromx;
        var dy = toy - fromy;
        var len = Math.sqrt(dx * dx + dy * dy);
        var headlen = len / 3;   // length of head in pixels
        var angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    function getForce(pos, bodies) {
        let alignmentForce = new Point(0, 0);
        let crowdedness = new Array(bodies.length);
        for (let i = 0; i < bodies.length; i++) {
            if (bodies[i].dist(pos) > 4 * pitch) {
                continue;
            }
            const body = bodies[i];
            crowdedness[i] = 1;
            continue;
            for (let j = i + 1; j < bodies.length; j++) {
                if (bodies[j].dist(pos) > 4 * pitch) {
                    continue;
                }
                const body2 = bodies[j];
                crowdedness[i] += body.dist2(body2)/(pitch*pitch);
                //const segmentForce = getSegmentForce(pos, body, body2, bodies);
                //alignmentForce = alignmentForce.plus(segmentForce);
            }
        }
        alignmentForce = alignmentForce.limit(maxSpeed);

        let resistanceForce = new Point(0, 0);
        for (let i = 0; i < bodies.length; i++) {
            if (crowdedness[i] === undefined) {
                continue;
            }
            const body = bodies[i];
            const singleForce = getSingleForce(pos, body, Math.pow(crowdedness[i], 0));
            resistanceForce = resistanceForce.plus(singleForce);
        }
        //resistanceForce = resistanceForce.limit(maxSpeed);

        let netForce = alignmentForce.plus(resistanceForce).limit(maxSpeed);
        return resistanceForce;
    }

    function drawBody(body, color = 'black') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(body.x, body.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawVectorField() {
        const spacing = 10;
        let exclude = window.exclude;
        let otherBodies = bodies.slice();
        if (exclude !== undefined) {
            otherBodies.splice(exclude, 1);
        }
        for (let y = 0; y < canvas.height; y += spacing) {
            for (let x = 0; x < canvas.width; x += spacing) {
                let netForce = getForce(new Point(x, y), otherBodies);

                if (netForce.magnitude() > 0) {
                    netForce = netForce.limit(maxSpeed);
                    netForce = netForce.multiply(spacing / maxSpeed);
                    drawArrow(x, y, x + netForce.x, y + netForce.y);
                }
            }
        }
        if (exclude !== undefined) {
            drawBody(bodies[exclude], 'purple');
        }
    }

    function drawBodies() {
        bodies.forEach(body => {
            drawBody(body);
        });
    }

    let keysPressed = []; // Stores the keys pressed
    function isKeyPressed(key) {
        return keysPressed.indexOf(key) > -1;
    }
    let drawingVectorField = true;
    let newlyPressed = true;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBodies();
        if (drawingVectorField) {
            drawVectorField();
        }
    }

    function iterate() {
        if (isKeyPressed('KeyV')) {
            if (newlyPressed) {
                drawingVectorField = !drawingVectorField;
            }
            newlyPressed = false;
        } else {
            newlyPressed = true;
        }
        if (isKeyPressed('KeyR')) {
            initBodies();
        }
        let deltaTime = 1 / 60;
        let forces = [];
        for (let body of bodies) {
            let otherBodies = bodies.filter(v => v != body);
            let force = getForce(body, otherBodies);
            forces.push(force);
        }
        for (let i = 0; i < bodies.length; i++) {
            bodies[i] = bodies[i].plus(forces[i].multiply(deltaTime));
        }
        draw();

        requestAnimationFrame(iterate);
    }
    iterate();

    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        bodies.push(new Point(x, y));
        draw();
    });

    // Keypress Logic
    document.addEventListener('keydown', (event) => {
        // Add the key to the keysPressed array if it's not already there
        if (!keysPressed.includes(event.code)) {
            keysPressed.push(event.code);
        }
    });
    document.addEventListener('keyup', (event) => {
        // Remove the key from the keysPressed array
        const index = keysPressed.indexOf(event.code);
        if (index > -1) {
            keysPressed.splice(index, 1);
        }
    });
}

