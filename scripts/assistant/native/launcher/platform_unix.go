//go:build !windows

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

package main

import (
	"fmt"
	"os"
	"os/exec"
)

func configure(command *exec.Cmd) {}
func showError(message string)    { fmt.Fprintln(os.Stderr, message) }
