# Dockerfile Multi-Stage Builds

A Dockerfile is a build recipe for a container image. Each `FROM` instruction begins a new build stage. Later stages do not automatically inherit the complete filesystem of earlier stages; required artifacts must be copied into them explicitly.

A common pattern is:

1. Use a build stage with compilers, package managers, and other build dependencies.
2. Produce the deployable artifact.
3. Start a smaller runtime stage.
4. Copy only the artifact and runtime necessities into the final stage.

This separation keeps build-only tooling out of the final runtime image and makes the contents of that image intentional.

Source: [original personal Docker note](../../sources/notes/technologies/docker.md)

