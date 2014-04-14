DIR=$PWD
DEPLOY_SSH_SERVER="mohit@my.vexflow.com"
DEPLOY_DIR="/home/mohit/www/vexflow/vextab"
DEPLOY_SSH_DIR="$DEPLOY_SSH_SERVER:$DEPLOY_DIR"
DEPLOY_VEXFLOW_DIR="$DEPLOY_SSH_SERVER:/home/mohit/www/vexflow"

# scp with `./deploy.sh`
# ssh with `./deploy.sh ssh <COMMAND>`

if [ "$1" != "ssh" ]; then
    scp "build/tabdiv-min.js $DEPLOY_SSH_DIR/support"
    scp "build/tabdiv-debug.js $DEPLOY_SSH_DIR/support"
    scp "-r support $DEPLOY_SSH_DIR"
    scp "build/tabdiv-min.js $DEPLOY_VEXFLOW_DIR/support"
    scp "build/tabdiv-debug.js $DEPLOY_VEXFLOW_DIR/support"
    scp "doc/* $DEPLOY_SSH_DIR"
else
    ssh "$DEPLOY_SSH_SERVER 'source ~/.bash_profile; cd $DEPLOY_DIR; $2'"
fi