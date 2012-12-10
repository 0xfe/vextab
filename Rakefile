# Rakefile for VexTab
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>

require "bundler/setup"
require 'fileutils'
require 'rake/testtask'

DIR = File.dirname(__FILE__)

COFFEE = "node_modules/.bin/coffee"
JISON = "node_modules/.bin/jison"

directory 'build'

FileList['src/*.coffee'].each do |src|
  file "build/output/#{File.basename(src, '.coffee')}.js" => [src, 'build'] do |task|
    sh "#{COFFEE} -o build/output --compile #{task.prerequisites.first}"
  end

  task :coffee => "build/output/#{File.basename(src, '.coffee')}.js"
end

file 'build/output/vextab_parser.js' => 'src/vextab.jison' do
  sh "#{JISON} src/vextab.jison -o build/output/vextab_parser.js"
end

file 'build/src' => 'build' do
  sh 'cp -R src build'
end

file 'build/support' => 'build' do
  sh 'cp -R support build'
end

task :clean do
  sh 'rm -rf build'
end

task :watch do
  sh 'bundle exec guard'
end

task :make => [:coffee, 'build/src', 'build/support', 'build/output/vextab_parser.js']

task :default => [:make]
