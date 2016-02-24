# JBEI Python Code

This package contains Python code for general JBEI use, particularly for client interface to JBEI's
web application at the API level. Code here is a work in progress, and should eventually be
versioned and distributed independently of (though in coordinated with) specific application code
 such as EDD or ICE.

If you aren't familiar with what an [API](https://en.wikipedia.org/wiki/Application_programming_interface)
is, you probably shouldn't be using these scripts, or you should do so with help and with great
care to avoid destroying important data.

This initial version of these scripts and API's are only supported for the purpose of automating
line creation in EDD. Feel free to write your own code against the API's defined here, but expect
some changes as we polish them in upcoming versions.

## Conventions in this document

Don't panic! :-)

These directions assume you're basically comfortable using the OSX Terminal. If not, or if you use
 other Python tools such as iPython, Jupyter, Pandas, etc and aren't comfortable working with
 virtual environments, it's probably best to ask for help.

 File names and terminal commands below are specially-formatted to clarify that they're
 associated with the `Terminal`. In a multi-line terminal block below, each line should be
 executed on its own, followed by Enter.  We've made an attempt to point out how to verify that
 commands work correctly on your computer, but you should generally pay attention to the command
 output to notice any obvious signs that something went wrong (though unfortunately, the signs may
 not always be obvious).

 This stuff can be intimidating! Ask for help!

## Set up a Python 2 environment to run this code
### Mac OSX


#### Install basic development tools needed to support the scripts.
 Depending on what's already installed / in use on your computer, you'll want to consider
 following directions in four of the first three sections below, plus (Xcode, Homebrew, Python, pip,
 virtualenvwrapper).

1. Install XCode: <a name="XCode"/>
    Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": you can just run `xcode-select --install` at the terminal to just
    only get the command-line tools
    * Run the command below to stablish `/usr/include`:

         ``sudo ln -s `xcrun --show-sdk-path`/usr/include /usr/include``
2. Install (Homebrew)[http://brew.sh/] <a name="HomeBrew"/>

        ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
        brew doctor
3. Install Python 2 <a name="Python"/>
    * Replace default OS X version of Python with the more up-to-date Homebrew version

        `brew install python`
    * You may need to relaunch the terminal to see the proper Python version. Test by running
    `python --version`

4. Create a [virtual environment](http://docs.python-guide.org/en/latest/dev/virtualenvs/) to
isolate
dependencies for these scripts from other Python code on your computer. Even if you don't do any
other Python work at present, it's best to start off on the right foot in case you need to do it
later on.

   * Install virtualenvwrapper

       `sudo pip install virtualenvwrapper`
   * Add the following lines to your shell startup file (e.g. `~/.bash_profile`), or create one
   if it doesn't exist

            # configure virtualenvwrapper to isolate Python environments
            export WORKON_HOME=$HOME/.virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh
   * Include the changes you just made in the current Terminal:

            source ~/.bash_profile

   * Create a virtual environment for running these scripts

            mkvirtualenv jbei-scripts
            workon jbei-scripts

5. Check that your Terminal is working in the context of the the virtual environment you just
created.

    After running commands above to create a virtual environment, you'll want to get in the habit of
    checking that your terminal is using the correct virtual environment before running scripts
    included in this package, and especially before using `pip` to change the installed Python
    packages.

    To check which virtual environment your Terminal is in, run the Terminal and look at the
    Terminal's command prompt. The virtual environment name will be in parenthesis at the
    beginning of the prompt. For example:

        (jbei-python)mark.forrer@mforrer-mr:/Users/mark.forrer$
    Alternately, you can edit change your `.bash_profile` to use this virtual environment by default
    by appending the line `workon jbei-scripts` after the commands you added above.

#### Check out code to run the scripts
	
* Download scripts from https://repo.jbei.org/projects/EDD/repos/edd-django/browse. These files may eventually be hosted elsewhere, but for now the initial versions are being developed/maintained concurrently with EDD.
* Do a [sparse checkout](http://jasonkarns.com/blog/subdirectory-checkouts-with-git-sparse-checkout/) to get just the subsection of EDD code that you need to run these scripts. You won't want the whole application codebase. For example, run the following commands:
   * Create and initialize your local repo (replacing sample below with your own LDAP username):
   
	       mkdir jbei\ python\ scripts && cd jbei\ python\ scripts
	       git init
	       git remote add –f edd-django https://your-username@repo.jbei.org/scm/edd/edd-django.git
   * Enable sparse checkout so you can get just the scripts you need.

           git config core.sparsecheckout true
	   
   * Configure git's `sparse-checkout`` file to get just the script code and its dependencies in the
    EDD code

           echo jbei/ >> .git/info/sparse-checkout
	   
   * Checkout the scripts

           git pull edd-django master
	   
* Install required Python packages
	    workon jbei-scripts
        pip install -r requirements.txt
	
* Add the `jbei` directory, and any desired subdirectories to the $PYTHONPATH

    cd jbei/
	PYTHONPATH=$PYTHONPATH:`pwd`/jbei:`pwd`/jbei/edd/rest/scripts/
	
	alternately, add the `PYTHNONPATH line above to your .bash_profile
	
* Edit the `jbei/edd/rest/scripts/settings.py` file if needed. Its purpose is to set defaults used
 by the scripts to contact EDD and ICE.  Unless you're using it for code development or testing,
 the defaults should be fine.

## Run a script!

For example: `python create_lines.py my_csv_file.csv -study 1234`

## Get the latest code

From the repository directory you configured, just run

    git pull

Keep in mind that new code may have been added somewhere other than where your sparse checkout is
 looking for it! You can always browse the rest of the code in [BitBucket](https://repo.jbei.org/projects/EDD/repos/edd-django/browse/jbei/)
 if that's needed.



	
	   
	   