## Set up a Python 3 environment
### Mac OSX<a name=setup_python_mac></a>

This document contains directions for setting up a Python 3 environment to run client-side Python
code distributed with EDD.

## Conventions in this document

Don't panic! :-)

These directions assume you're using a Mac and that you're basically comfortable using the OSX
Terminal. If not, or if you use
other Python tools such as iPython, Jupyter, Pandas, etc and aren't comfortable working with
virtual environments, it's probably best to ask for help.

File names and terminal commands below are specially-formatted to clarify that they're
associated with the `Terminal`. In a multi-line terminal block below, each line should be
executed on its own, followed by Enter.  We've made an attempt to point out how to verify that
commands work correctly on your computer, but you should generally pay attention to the command
output to notice any obvious signs that something went wrong (though unfortunately, the signs may
not always be obvious).

This stuff can be intimidating! Ask for help!

#### Install basic development tools needed to support the scripts.
Depending on what's already installed on your computer, you'll want to consider
following directions the sections below. If you're a software developer and have already configured
Docker for development, you can skip this section and just run scripts from inside the
`jbei/rest-client` container, or from within EDD's `edd` container. Directions below are for
configuring a new Python 3 environment with only the minimal dependencies for scripts that
interact with, but aren't an integral part of, EDD.

1. Install XCode: <a name="XCode"></a>
    Install XCode and associated Developer Tools via the App Store. If you type `git` at the
    command line and get a usage message rather than `command not found` or similar , you can
    probably skip this step.
    * As of OS X 10.9 "Mavericks": you can just run `xcode-select --install` at the terminal to
      just only get the command-line tools
2. Install [Homebrew][3] <a name="HomeBrew"></a>

        ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
        brew doctor
3. Install Python 3 <a name="Python"></a>
    * Replace default OS X version of Python with the more up-to-date Homebrew version

        `brew install python3`
    * You may need to relaunch the terminal to see the proper Python version. Test by running
      `python3 --version`

4. Set up your computer to allow visibilty into hidden files.

    If you're comfortable with the Terminal, and particularly with:
      * viewing hidden files
      * using command line tools to edit text files

    then there's nothing to do for this step.

    Otherwise, the simplest way forward is
    to run the command below in the Terminal. It will enable you to see hidden files in the Finder
    and in the file viewer launched by the File -> Open menu in any text editor:

    `defaults write com.apple.finder AppleShowAllFiles YES`

5. Create a [virtual environment][4] to
   isolate dependencies for these scripts from other Python code on your computer. Even if you
   don't do any other Python work at present, it's best to start off on the right foot in case
   you need to do so later on.

   * Install virtualenvwrapper

       `sudo pip3 install virtualenvwrapper`
   * Add the following lines to your shell startup file (e.g.
     `/Users/your_username/.bash_profile`), or create one if it doesn't exist. Remember that
     because this file is hidden (starts with a '.'), it may not be visible by default (see
     previous step).

     Open the text editor of your choice to open/create `.bash_profile` and add the following
     lines:

            # configure virtualenvwrapper to isolate Python environments
            export WORKON_HOME=$HOME/.virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh
   * Incorporate the changes you just made into your current Terminal:

            source ~/.bash_profile

   * Create a virtual environment for running these scripts

            mkvirtualenv jbei
            workon jbei

6. Check that your Terminal is working in the context of the the virtual environment you just
created.

    After running commands above to create a virtual environment, you'll want to get in the habit
    of checking that your terminal is using the correct virtual environment before running scripts
    included in this package, and especially before using `pip` to change the installed Python
    packages.

    To check which virtual environment your Terminal is in, run the Terminal and look at the
    Terminal's command prompt. The virtual environment name will be in parenthesis at the
    beginning of the prompt. For example:

        (jbei)username@hostname:/Users/username$
    Alternately, you can edit change your `.bash_profile` to use this virtual environment by
    default by appending the line `workon jbei` after the commands you added above.

#### Check out code to run the scripts

* Download scripts from [the GitHub repo][5].
  These files may eventually be hosted elsewhere, but for now the initial versions are being
  developed/maintained concurrently with EDD.
* Do a sparse checkout
  to get just the subsection of EDD code that you need to run these scripts. You won't want the
  whole application codebase. For example, run the following commands:
   * Create and initialize your local repo (replacing the sample on the last line below with
   your own LDAP username):
   
	       mkdir code && cd code
	       git init
	       git remote add origin https://github.com/JBEI/edd.git
   * Enable sparse checkout so you can get just the scripts you need.

           git config core.sparsecheckout true
	   
   * Configure git's `sparse-checkout`` file to get just the script code and its dependencies in
     the EDD code

           echo jbei/* >> .git/info/sparse-checkout
	   
   * Checkout the scripts

           git pull origin master
	   
* Install required Python packages.

    First confirm that you're working in the correct virtualenv! See directions above.

	    workon jbei
	    pip install -r jbei/requirements.txt
	
* Add the `code` directory, and any desired subdirectories to the $PYTHONPATH

      cd code/
      PYTHONPATH=$PYTHONPATH:`pwd`/code

  Alternately, update the `PYTHNONPATH` in your `.bash_profile`

#### Get the latest code

From the repository directory you configured, just run

    git pull

Keep in mind that new code may have been added in a different branch or in a different directory
than where your sparse checkout is looking for it! You can always browse the rest of the code in
[GitHub][7] if that's needed.

[3]:    http://brew.sh/
[4]:    http://docs.python-guide.org/en/latest/dev/virtualenvs/
[5]:    https://github.com/JBEI/edd/
[7]:    https://github.com/JBEI/edd/tree/master/jbei/