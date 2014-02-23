# Rakefile for VexTab
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>

require "bundler/setup"
require 'fileutils'
require 'rake/testtask'

DIR = File.dirname(__FILE__)
DEPLOY_SSH_SERVER = "mohit@my.vexflow.com"
DEPLOY_DIR = "/home/mohit/www/vexflow/vextab"
DEPLOY_SSH_DIR = "#{DEPLOY_SSH_SERVER}:#{DEPLOY_DIR}"
DEPLOY_VEXFLOW_DIR = "#{DEPLOY_SSH_SERVER}:/home/mohit/www/vexflow"

def ssh(command)
  sh "ssh #{DEPLOY_SSH_SERVER} 'source ~/.bash_profile; cd #{DEPLOY_DIR}; #{command}'"
end

COFFEE = "node_modules/.bin/coffee"
JISON = "node_modules/.bin/jison"

directory 'build/output'
directory 'build/src'
directory 'build/support'
directory 'build/doc'

generated_sources = [
  "build/output/vextab_parser.js",
  "build/output/tabdiv2.js",
  "build/output/artist.js",
  "build/output/vextab.js"
]

FileList['src/*.coffee'].each do |src|
  cs_source = src
  js_target = "build/output/#{File.basename(src, '.coffee')}.js"

  file js_target => [cs_source, 'build/output'] do
    sh "#{COFFEE} -o build/output --compile #{cs_source}"
  end

  task :coffee => js_target
end

def copy_path(path_glob, dest_dir, name)
  FileList[path_glob].each do |source|
    target = "#{dest_dir}/#{File.basename(source)}"
    file target => [source, dest_dir] do
      cp source, target, :verbose => true
    end

    desc "Copy data in: #{path_glob}"
    task name => target
  end
end

file 'build/output/vextab_parser.js' => ['src/vextab.jison', 'build/output'] do
  sh "#{JISON} src/vextab.jison -o build/output/vextab_parser.js"
end

file 'build/output/tabdiv2.js' => ['src/tabdiv2.js', 'build/output'] do
  sh "cp src/tabdiv2.js build/output/tabdiv2.js"
end

file 'build/tabdiv-min.js' => generated_sources do
  require 'uglifier'
  files = generated_sources

  raw_file = File.open("build/tabdiv-debug.js", "w")
  min_file = File.open("build/tabdiv-min.js", "w")

  files.each do |file|
    puts "Uglifying: " + file
    contents = File.read(file)
    min = Uglifier.new.compile(contents)
    raw_file.write(contents)
    min_file.write(min)
  end

  raw_file.close
  min_file.close

  # Create a copy in support/
  sh 'cp build/tabdiv-min.js build/support'
  sh 'cp build/tabdiv-debug.js build/support'
end

copy_path("src/*", "build/src", :build_copy)
copy_path("support/*", "build/support", :build_copy)
copy_path("doc/*", "build/doc", :build_copy)

task :clean do
  sh 'rm -rf build'
end

task :watch do
  sh 'bundle exec guard -i'
end

task :make => [:build_copy, :coffee, 'build/tabdiv-min.js']

task :deploy => :make do
  sh "scp build/tabdiv-min.js #{DEPLOY_SSH_DIR}/support"
  sh "scp build/tabdiv-debug.js #{DEPLOY_SSH_DIR}/support"
  sh "scp -r support #{DEPLOY_SSH_DIR}"
  sh "scp build/tabdiv-min.js #{DEPLOY_VEXFLOW_DIR}/support"
  sh "scp build/tabdiv-debug.js #{DEPLOY_VEXFLOW_DIR}/support"
  sh "scp doc/* #{DEPLOY_SSH_DIR}"
end

task :default => [:make]
