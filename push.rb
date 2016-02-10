#!/usr/bin/env ruby
require 'rake'

DIR = File.dirname(__FILE__)
DEPLOY_SSH_SERVER = "mohit@static.muthanna.com"
DEPLOY_DIR = "/home/mohit/www/vexflow"
DEPLOY_SSH_DIR = "#{DEPLOY_SSH_SERVER}:#{DEPLOY_DIR}"
DEPLOY_VEXFLOW_DIR = "#{DEPLOY_SSH_SERVER}:/home/mohit/www/vexflow"

sh "scp -r releases #{DEPLOY_SSH_DIR}"
sh "scp doc/* #{DEPLOY_SSH_DIR}/vextab"

# Push for Google Docs Addon
sh "scp build/vextab-div.js #{DEPLOY_SSH_DIR}/support/vextab-div-googledocs.current.js"

puts "Warning! Not pushed to backup server (static1 and static2)"
