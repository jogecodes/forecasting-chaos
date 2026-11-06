// Numerical illustrations only; these do not change the saved forecasting study.
export function lorenzTrajectory(initial, duration = 40, outputDt = .01, step = .0005) {
  const substeps = Math.round(outputDt / step);
  const samples = Math.round(duration / outputDt);
  if (initial.length !== 3 || !initial.every(Number.isFinite) || substeps < 1 ||
      !(duration > 0 && step > 0) || Math.abs(substeps * step - outputDt) > 1e-12) {
    throw new RangeError('Invalid Lorenz integration settings');
  }
  const result = new Float64Array((samples + 1) * 3);
  let [x, y, z] = initial;
  result.set(initial);
  const f = (a, b, c) => [10 * (b - a), a * (28 - c) - b, a * b - (8 / 3) * c];
  for (let i = 1; i <= samples; i++) {
    for (let k = 0; k < substeps; k++) {
      const a = f(x, y, z);
      const b = f(x + step * a[0] / 2, y + step * a[1] / 2, z + step * a[2] / 2);
      const c = f(x + step * b[0] / 2, y + step * b[1] / 2, z + step * b[2] / 2);
      const d = f(x + step * c[0], y + step * c[1], z + step * c[2]);
      x += step / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
      y += step / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
      z += step / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2]);
    }
    result.set([x, y, z], i * 3);
  }
  return result;
}

export function firstSeparation(distances, dt, threshold = 1) {
  const index = distances.findIndex(value => value >= threshold);
  return index < 0 ? null : index * dt;
}

export function sensitivityPair(epsilon, reference = lorenzTrajectory([1, 1, 1])) {
  if (!(epsilon >= 1e-8 && epsilon <= 1)) throw new RangeError('Perturbation outside the illustrated range');
  const other = lorenzTrajectory([1 + epsilon, 1, 1]);
  const n = reference.length / 3;
  const data = new Float64Array(n * 6), separation = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    data.set(reference.subarray(i * 3, i * 3 + 3), i * 6);
    data.set(other.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    separation[i] = Math.hypot(...[0, 1, 2].map(j => reference[i * 3 + j] - other[i * 3 + j]));
  }
  return { data, separation, horizon: firstSeparation(separation, .01) };
}

export function logisticBifurcation(min = 2.5, max = 4, columns = 900, keep = 96, discard = 1000) {
  if (!(min >= 0 && min < max && max <= 4) || columns < 2 || keep < 1 || discard < 0) throw new RangeError('Invalid bifurcation range');
  const points = new Float64Array(columns * keep * 2);
  for (let column = 0; column < columns; column++) {
    const r = min + (max - min) * column / (columns - 1);
    let x = .2;
    for (let i = 0; i < discard + keep; i++) {
      x = r * x * (1 - x);
      if (i >= discard) {
        const offset = (column * keep + i - discard) * 2;
        points[offset] = r;points[offset + 1] = x;
      }
    }
  }
  return points;
}

export function observedPeriod(values, maxPeriod = 16, tolerance = 1e-7) {
  for (let period = 1; period <= maxPeriod; period++) {
    let matches = true;
    for (let i = Math.max(period, values.length - 128); i < values.length; i++) {
      if (Math.abs(values[i] - values[i - period]) > tolerance) { matches = false;break; }
    }
    if (matches) return period;
  }
  return null;
}

export function pendulumPhase(states) {
  // Unwrapped angle versus angular velocity: a projection of the 4D state.
  const out = new Float64Array(states.length / 4 * 2);
  for (let i = 0; i < states.length / 4; i++) {
    out[i * 2] = states[i * 4];out[i * 2 + 1] = states[i * 4 + 2];
  }
  return out;
}

export function waterwheelPhase(states, buckets) {
  // Actual bucket masses, using instantaneous angles, not a reduced Lorenz model.
  const width = buckets + 2, out = new Float64Array(states.length / width * 3);
  for (let i = 0; i < states.length / width; i++) {
    const theta = states[i * width];
    let sine = 0, cosine = 0;
    for (let j = 0; j < buckets; j++) {
      const angle = theta + j * 2 * Math.PI / buckets, mass = states[i * width + j + 2];
      sine += mass * Math.sin(angle);cosine += mass * Math.cos(angle);
    }
    out.set([states[i * width + 1], sine, cosine], i * 3);
  }
  return out;
}

export function standardizeProjection(states, dimensions) {
  const n = states.length / dimensions;
  const result = new Float64Array(states.length);
  for (let j = 0; j < dimensions; j++) {
    let mean = 0, sum = 0;
    for (let i = 0; i < n; i++) mean += states[i * dimensions + j] / n;
    for (let i = 0; i < n; i++) sum += (states[i * dimensions + j] - mean) ** 2 / n;
    const scale = Math.sqrt(sum) || 1;
    for (let i = 0; i < n; i++) result[i * dimensions + j] = (states[i * dimensions + j] - mean) / scale;
  }
  return result;
}
