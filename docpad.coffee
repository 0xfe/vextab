# DocPad Configuration
docpadConfig = {

    # Root Path
    # The root path of our our project
    rootPath: process.cwd()  # default process.cwd()

    # Plugins Paths
    # An array of paths which to load multiple plugins from
    pluginsPaths: [  # default: ['node_modules', 'plugins']
        'node_modules'
        'plugins'
    ]

    # Render Passes
    # How many times should we render documents that reference other documents?

    # in our case we need 2 for the eco files
    renderPasses: 2  # default: 1

    # Regenerate Delay
    # The time (in milliseconds) to wait after a source file has
    # changed before using it to regenerate. Updating over the
    # network (e.g. via FTP) can cause a page to be partially
    # rendered as the page is regenerated *before* the source file
    # has completed updating: in this case increase this value.
    regenerateDelay: 100    # default 100

    # Out Path
    # Where should we put our generated website files?
    # If it is a relative path, it will have the resolved `rootPath` prepended to it
    outPath: 'build'  # default: 'out'

    # Src Path
    # Where can we find our source website files?
    # If it is a relative path, it will have the resolved `rootPath` prepended to it
    srcPath: 'src'  # default: 'src'

    # Documents Paths
    # An array of paths which contents will be treated as documents
    # If it is a relative path, it will have the resolved `srcPath` prepended to it

    # in our case: all files which we want to convert (for instane: coffee -> js)
    documentsPaths: [  # default ['documents']
        'lib'       # src/lib
    ]

    # Files Paths
    # An array of paths which contents will be treated as files
    # If it is a relative path, it will have the resolved `srcPath` prepended to it

    # in our case: static file which should not be converted
    filesPaths: [  # default: ['files', 'public']
        'files'   # src/support
    ]

    # Layouts Paths
    # An array of paths which contents will be treated as layouts
    # If it is a relative path, it will have the resolved `srcPath` prepended to it
    layoutsPaths: [  # default ['layouts']
        'layouts'
    ]

    plugins:
        uglify:
            environments:
                development:
                    enabled: true


}

module.exports = docpadConfig