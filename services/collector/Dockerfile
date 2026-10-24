FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY services/collector/ services/collector/
COPY examples/worker/ examples/worker/
RUN CGO_ENABLED=0 go build -o /collector ./services/collector && CGO_ENABLED=0 go build -o /worker ./examples/worker

FROM alpine:3.21
COPY --from=build /collector /usr/local/bin/collector
COPY --from=build /worker /usr/local/bin/worker
CMD ["collector"]
