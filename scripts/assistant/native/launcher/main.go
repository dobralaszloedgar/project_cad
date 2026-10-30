package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func main() {
	binary, err := os.Executable()
	if err != nil {
		showError(err.Error())
		os.Exit(1)
	}
	directory := filepath.Dir(binary)
	node := "node"
	if runtime.GOOS == "windows" {
		node += ".exe"
	}
	args := append([]string{filepath.Join(directory, "app", "desktop.mjs")}, os.Args[1:]...)
	command := exec.Command(filepath.Join(directory, "runtime", node), args...)
	command.Dir = directory
	var output, errors bytes.Buffer
	command.Stdout, command.Stderr = &output, &errors
	configure(command)
	if err := command.Run(); err != nil {
		message := errors.String()
		if message == "" {
			message = err.Error()
		}
		showError("Project CAD Assistant could not start.\n\n" + message)
		os.Exit(1)
	}
	fmt.Print(output.String())
}
