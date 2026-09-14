#!/usr/bin/env bats

setup() {
	load test_helper
	fixtures bats
}

@test "no arguments prints message and usage instructions" {
	run bats
	[ $status -eq 1 ]
	[ "${lines[0]}" == 'Error: Must specify at least one <test>' ]
}

@test 'single quotes and double quotes both work' {
	run bats --pretty "$FIXTURE_ROOT/passing.bats"
	[ $status -eq 0 ]
}

teardown() {
	rm -rf "$BATS_TEST_TMPDIR"
}
