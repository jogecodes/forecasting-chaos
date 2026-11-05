// Pure numerical/display helpers, shared by the site and its verification suite.
export function logisticTrajectory(r, initial = 0.2, steps = 500, discard = 200) {
  if (!(r >= 0 && r <= 4) || !(initial > 0 && initial < 1)) throw new RangeError('Invalid logistic parameters');
  const values = new Float64Array(steps);
  let x = initial;
  for (let i = 0; i < steps + discard; i++) {
    x = r * x * (1 - x);
    if (i >= discard) values[i - discard] = x;
  }
  return values;
}

export function trainingScaledError(truth, predicted, dimensions, scales) {
  if (truth.length !== predicted.length || truth.length % dimensions || scales.length !== dimensions) {
    throw new RangeError('Incompatible physical-state arrays');
  }
  const result = new Float64Array(truth.length / dimensions);
  for (let i = 0; i < result.length; i++) {
    let sum = 0;
    for (let j = 0; j < dimensions; j++) {
      const delta = (truth[i * dimensions + j] - predicted[i * dimensions + j]) / scales[j];
      sum += delta * delta;
    }
    result[i] = Math.sqrt(sum / dimensions);
  }
  return result;
}

export function column(data, width, index) {
  const values = new Float64Array(data.length / width);
  for (let i = 0; i < values.length; i++) values[i] = data[i * width + index];
  return values;
}

export function boundsOf(series) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const { data, width, offset = 0, dimensions = 3 } of series) {
    for (let i = 0; i < data.length / width; i++) {
      for (let j = 0; j < 3; j++) {
        const value = j < dimensions ? data[i * width + offset + j] : 0;
        low[j] = Math.min(low[j], value);
        high[j] = Math.max(high[j], value);
      }
    }
  }
  return { center: low.map((v, i) => (v + high[i]) / 2), extent: Math.max(...high.map((v, i) => v - low[i]), 1e-6) };
}

export function project(point, bounds, yaw, pitch, width, height) {
  const [x, y, z] = point.map((v, i) => (v - bounds.center[i]) / bounds.extent);
  const horizontal = x * Math.cos(yaw) - y * Math.sin(yaw);
  const depth = x * Math.sin(yaw) + y * Math.cos(yaw);
  const vertical = z * Math.cos(pitch) - depth * Math.sin(pitch);
  const size = Math.min(width * .78, height * .75);
  return [width / 2 + horizontal * size, height / 2 - vertical * size];
}

export function decodeFloat32(buffer, descriptor) {
  const count = descriptor.shape.reduce((a, b) => a * b, 1);
  if (buffer.byteLength !== count * 4 || buffer.byteLength !== descriptor.bytes) {
    throw new Error(`Invalid playback asset length: ${descriptor.file}`);
  }
  const view = new DataView(buffer);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) values[i] = view.getFloat32(i * 4, true);
  return values;
}

export function extractState(rows, rowWidth, dimensions, offset = 0) {
  const result = new Float32Array(rows.length / rowWidth * dimensions);
  for (let i = 0; i < rows.length / rowWidth; i++) {
    for (let j = 0; j < dimensions; j++) result[i * dimensions + j] = rows[i * rowWidth + offset + j];
  }
  return result;
}

export function prependState(series, state) {
  const out = new Float32Array(series.length + state.length);
  out.set(state);
  out.set(series, state.length);
  return out;
}
