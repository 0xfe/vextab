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
  cs_source = src
  js_target = "build/output/#{File.basename(src, '.coffee')}.js"

  file js_target => [cs_source, 'build'] do
    sh "#{COFFEE} -o build/output --compile #{cs_source}"
  end

  task :build_coffee => js_target
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

task :make => [:build_coffee, 'build/src', 'build/support', 'build/output/vextab_parser.js']

task :default => [:make]
