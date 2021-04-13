# macOS Setup

This page contains directions for setting up a development environment for EDD
on macOS.

## XCode

Macs have tools for development freely available, but these tools are not
installed by default. To ensure the necessary utilities are installed, get
XCode from the App Store. After launching the XCode app, you should be prompted
to install additional components. With macOS 10.12 "Sierra" or later, the
utilites used by EDD can be installed by running `xcode-select --install` from
the Terminal.

## Homebrew

[Homebrew][1] is a package manager for OS X. The Homebrew packages handle
installation and dependency management for Terminal software. The Caskroom
extension to Homebrew does the same for GUI applications. There is a `Brewfile`
in the root of the EDD repository that defines the software used for
EDD development.

To install, run the below command in Terminal, and follow the prompts.

```bash
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

After installing Homebrew, the `brew` command will be available to run in
Terminal. Running `brew doctor` should say `Your system is ready to brew.` or
describe any problems with the install. Then use Homebrew to install tools for
EDD with this command:

```bash
brew bundle
```

It is a good idea to occaisionally run `brew update` to refresh Homebrew's list
of available packages and versions; and run `brew upgrade` to install updated
versions of your installed Homebrew packages.

## Docker

[Docker][2] is a container virtualization platform: all software,
configuration, and dependencies required to run a service are packaged into
standalone images. These images are ready to run immediately upon being copied
to a new host running a Docker daemon. Docker is installed with the `Brewfile`
in the previous section.

Verify that Docker is installed and setup correctly by running:

```bash
docker run --rm hello-world
```

If you get:

```
docker: command not found
```

That means Docker was not successfully installed from Homebrew. Try getting the
Docker for Mac installer directly from the Docker project. The related
`docker-compose` utility manages launching multiple services in multiple
containers, based on a configuration file. Running the `docker-compose` command
should display some help text describing the options for using the tool. If you
do not see this help, try re-installing Docker for Mac.

Resources available for Docker containers are set in the Docker menu
Preferences, under the Advanced tab. It is recommended to allocate at least 2
CPU cores and 4 GB RAM to Docker. Click the `Apply & Restart` button to restart
Docker with updated resource allocations.

---

[1]: http://brew.sh/
[2]: https://docker.io/
