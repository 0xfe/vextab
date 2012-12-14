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

file 'build/output/tabdiv2.js' => 'src/tabdiv2.js' do
    sh "cp src/tabdiv2.js build/output/tabdiv2.js"
end

file 'build/src' => 'build' do
  sh 'cp -R src build'
end

file 'build/support' => 'build' do
  sh 'cp -R support build'
end

file 'build/doc' => 'build' do
    sh 'cp -R doc build'
end

task :clean do
  sh 'rm -rf build'
end

task :watch do
  sh 'bundle exec guard'
end

task 'build/tabdiv-min.js' => [:build_coffee,
                                'build/output/vextab_parser.js',
                                'build/output/tabdiv2.js'] do
  require 'uglifier'

  files = [
    'build/output/vextab_parser.js',
    'build/output/artist.js',
    'build/output/vextab.js',
    'build/output/tabdiv2.js'
    ]

  puts "Building build/tabdiv-min.js"
  File.open("build/tabdiv-min.js", "w") do |f|
    files.each do |file|
      min = Uglifier.new.compile(File.read(file))
      f.write(min)
    end
  end
end

task :make => [:build_coffee, 'build/src', 'build/doc',
               'build/support', 'build/tabdiv-min.js']

task :deploy => :make do
  sh 'scp -r build/* mohit@muthanna.com:www/vexflow/vextab2'
end

task :default => [:make]
