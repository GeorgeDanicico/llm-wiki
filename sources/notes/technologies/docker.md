
#### Dockerfile
- The dockerfile is the file based on which a docker image is build
- Each FROM starts a new stage, and everything between 2 FROMs is lost at the end, in the final image. Usually multiple stages are used when first you want to build the image, by installing everything required, and then just copy the executable, file required to run the application in the production environment
- 