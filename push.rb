require 'fileutils'

DIR = File.dirname(__FILE__)
DEPLOY_SSH_SERVER = "mohit@my.vexflow.com"
DEPLOY_DIR = "/home/mohit/www/vexflow/vextab"
DEPLOY_SSH_DIR = "#{DEPLOY_SSH_SERVER}:#{DEPLOY_DIR}"
DEPLOY_VEXFLOW_DIR = "#{DEPLOY_SSH_SERVER}:/home/mohit/www/vexflow"

task :deploy => :make do
  sh "scp releases/* #{DEPLOY_SSH_DIR}/support"
  sh "scp -r support #{DEPLOY_SSH_DIR}"
  sh "scp releases/* #{DEPLOY_VEXFLOW_DIR}/support"
  sh "scp doc/* #{DEPLOY_SSH_DIR}"
end