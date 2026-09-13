# Bash RC configuration file

export EDITOR="vim"
alias ll="ls -la"

my_function() {
    if [[ -z "$1" ]]; then
        echo "Error: argument required"
        return 1
    fi
    echo "Argument: $1"
}

  # bash options
set -o noclobber
PS1='\u@\h:\w\$ '
