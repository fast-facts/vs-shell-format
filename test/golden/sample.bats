#!/usr/bin/env bats

@test "adds numbers" {
    if [ "$1" = "1" ]; then
        echo ok
    fi
}

setup() {
    load test_helper
}
