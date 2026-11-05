import { lorenzTrajectory, sensitivityPair } from './dynamics.js';

let reference;
self.onmessage = ({ data: { id, epsilon } }) => {
  try {
    reference ||= lorenzTrajectory([1, 1, 1]);
    const result = sensitivityPair(epsilon, reference);
    self.postMessage({ id, ...result }, [result.data.buffer, result.separation.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
