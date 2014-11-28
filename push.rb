#!/usr/bin/env ruby
require 'rake'

DIR = File.dirname(__FILE__)
DEPLOY_SSH_SERVER = "mohit@my.vexflow.com"
DEPLOY_DIR = "/home/mohit/www/vexflow"
DEPLOY_SSH_DIR = "#{DEPLOY_SSH_SERVER}:#{DEPLOY_DIR}"
DEPLOY_VEXFLOW_DIR = "#{DEPLOY_SSH_SERVER}:/home/mohit/www/vexflow"

sh "scp -r releases #{DEPLOY_SSH_DIR}"
sh "scp doc/* #{DEPLOY_SSH_DIR}/vextab"
