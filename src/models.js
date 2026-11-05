export const models = {
  pendulum: {
    name: 'Double pendulum', type: 'MECHANICAL / TWO ANGLES + TWO VELOCITIES', caption: 'Two linked pendulums / unit-length rods',
    description: 'Hang one pendulum from another and give it a push. Gravity pulls both down, but each swing changes how the other can move. Energy passes between the two arms: sometimes they swing together, sometimes the lower one whips around. Four numbers describe the motion; the two angles and how quickly each is changing. At high enough energies, this familiar mechanism can be chaotic; gentle swings can be regular too.',
    insight: '',
    equation: 'State = (θ₁, θ₂, ω₁, ω₂)\ndθ₁/dt = ω₁, dθ₂/dt = ω₂\nCoupled gravitational accelerations\nL₁ = L₂ = m₁ = m₂ = 1, g = 9.81',
  },
  waterwheel: {
    name: 'Waterwheel', type: 'MECHANICAL / 24 LEAKING BUCKETS', caption: 'Water enters near the top / each bucket leaks',
    description: 'Imagine a wheel with little buckets around its rim. Water pours in near the top and leaks out through the bottom of each bucket. The heavier side pulls the wheel around, carrying the buckets away from the stream and changing which ones fill next. The water moves the wheel, and the wheel changes where the water goes. This setup is known as the Lorenzian waterwheel.',
    insight: 'Here we’re simulating the mechanism itself: the buckets fill and leak, their weight creates torque, and the wheel responds. Watch the water distribution as it speeds up, slows down or reverses. Predicting the next turn means keeping track of every bucket and how its load affects the motion.',
    equation: 'dθ/dt = ω\nI dω/dt = gR Σ mⱼ sin(θ + 2πj/N) − drag·ω\ndmⱼ/dt = inflow·wⱼ − leak·mⱼ\nwⱼ ∝ exp(κ cos(θ + 2πj/N))',
  },
};
