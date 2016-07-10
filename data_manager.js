'use strict'
//TODO:change Taiwan to Asia(expand.js)
//TODO:use new function to response records
var HashMap = require('hashmap');
var bodyParser = require('body-parser');
var urlencode = require('urlencode');
var LineByLineReader = require('line-by-line');
var iconv = require('iconv-lite');
var querystring = require("querystring");
var fs = require('graceful-fs');
var S = require('string');
var dateFormat = require('dateformat');

var request = require('request');
var CronJob = require('cron').CronJob;

var express = require('express');
var app  = express();
var http = require('http');
var server = http.createServer(app);

app.use(bodyParser.json({limit: '500mb'}));
app.use(bodyParser.urlencoded({limit: '500mb', extended: true}));

var service = JSON.parse(fs.readFileSync('./service/data_manager.setting'));
var server_name=service['server_name'];
var server_version=service['server_version'];
var apiip=service['data_serverip'];
var apiport=service['data_serverport'];
var manager_key=service['manager_key'];
var logs=service['logs'];
var process_filename=service['process_filename'];
var asia_data=service['asia_data'];
var other_data=service['other_data'];
var data_filename=service['data_filename'];

var data_map_botkey = new HashMap();


server.listen(apiport,apiip,function(){
    console.log("[Server start] ["+new Date()+"] http work at "+apiip+":"+apiport);
});
/*TODO:init dir*/


app.post('/'+server_name+'/:key/'+server_version+'/uploaddata/:type(fb|ptt)/:location(asia|other)?',(req,res)=>{
    var type=req.params.type;
    var location=req.params.location;
    var key=req.params.key;
    var action='uploaddata';
    var size=0;
    var httpMessage='';
    var dir;
    var i;
    var content=req.body['content'];
    if(!data_map_botkey.has(key)){
        sendResponse(res,403,action,'false','','illegal api-key');

        /*TODO:recording ip*/

        return;
    }
    if(typeof location==='undefined'&&type=='fb'){
        sendResponse(res,400,action,'false','','must contains [?location={asia/other}');
        return;
    }
    else{
        var now=dateformat(new Date(),'yyyymmdd');
        if(location=='asia'){
            dir=asia_data+'/'+now+'_'+data_filename;
        }
        else{
            dir=other_data+'/'+now+'_'+data_filename;
        }
    }

    sendResponse(res,200,action,'ok','','');
    /*
    fs.appendFile('output.txt',content,'utf8',function(err){
        if(err){
            console.log('err:'+err);
        }
        size=Buffer.byteLength(content);
        res.send('size:'+size);
    });
    */
    req.on('data', function(data){
        size+=Buffer.byteLength(data);
        fs.appendFile(dir,data,'utf8',function(err){
            if(err){
                console.log('err:'+err);
            }
        });
    });
    req.on('end', function(data){
        console.log('--read end--');
        /*TODO:recording ip and datasize*/
    });
});

app.get('/'+server_name+'/:key/'+server_version+'/botmanager/:action(init|new|delete|clearall|list|search|update)',function(req,res){
    var key = req.params.key;
    var action = req.params.action;
    var id = req.query.id;
    var status = req.query.status;
    var result,i;
    if(key!=manager_key){
        sendResponse(res,403,action,'false','','illegal api-key');
        return;
    }
    if(typeof id ==="undefined"&&(action!='list'&&action!='clearall')){
        sendResponse(res,400,action,'false','','must contains [?id={id}]');
        return;
    }
    if(typeof status==='undefined'){
        status='init';
    }

    if(action=='init'){//初始原本已存在botkey(因為bot_manager和url_manager都重新開機時，需要還原上次的botkey list)
        var parts=id.split(',');
        var list=[];
        var init_id;
        for(i=0;i<parts.length;i++){
            init_id=parts[i];
            if(data_map_botkey.has(init_id)){
                result={id:init_id,status:data_map_botkey.get(init_id)};
                list.push(result);
                continue;
            }
            result={id:init_id,status:status};
            list.push(result);
            insertBotID(init_id,status,(flag,back_id,err_msg)=>{
                //flag:error(has exist),insert(not exist and insert ok)
                if(flag=='error'){
                    console.log('[insertBotID] ['+back_id+'] error:'+err_msg);
                }
                else{
                }
            });
        }
        sendResponse(res,200,action,'ok',list,'');
    }
    else if(action=='new'){
        insertBotID(id,status,(flag,back_id,err_msg)=>{
            //flag:error(has exist),insert(not exist and insert ok)
            if(flag=='error'){
                console.log('[insertBotID] ['+back_id+'] error:'+err_msg);
                sendResponse(res,200,action,'false',back_id+' has exist','');
            }
            else{
                result={id:back_id,status:status};
                sendResponse(res,200,action,'ok',result,'');
            }
        });
    }
    else if(action=='update'){
        updateBotID(id,status,(flag,back_id,stat,pre_stat,err_msg)=>{
            if(flag=='error'){
                console.log('[updateBotID] ['+back_id+'] error:'+err_msg);
                sendResponse(res,200,action,'false',back_id+' not exist','');
            }
            else{
                result={id:back_id,status:stat,previous_status:pre_stat};
                sendResponse(res,200,action,'ok',result,'');
            }
        });
    }
    else if(action=='delete'){
        deleteBotID(id,(flag,back_id,stat,err_msg)=>{
            //flag:error(not exist),delete(exist and delete ok)
            if(flag=='error'){
                console.log('[deleteBotID] ['+back_id+'] error:'+err_msg)
                sendResponse(res,200,action,'false',back_id+' not exist','');
            }
            else{
                result={id:back_id,status:stat};
                sendResponse(res,200,action,'ok',result,'');
            }
        });
    }

    else if(action=='search'){
        searchBotID(id,(flag,back_id,stat,err_msg)=>{
            //flag:error(not exist),search(exist)
            if(flag=='error'){
                sendResponse(res,200,action,'false',back_id+' not exist','');
            }
            else{
                result={id:back_id,status:stat};
                sendResponse(res,200,action,'ok',result,'');
            }
        });
    }
    else if(action=='list'){
        listAllBotID((list)=>{
            if(list=='error'){
                sendResponse(res,503,action,'ok','','Server error');
            }
            else{
                sendResponse(res,200,action,'ok',list,'');
            }

        });
    }
    else if(action=='clearall'){
        clearAllBotID();
        console.log('[clearAllBotID] clear all bot key');
        sendResponse(res,200,action,'ok','clear all bot key','');
    }
});

function insertBotID(key,stat,fin){
    if(data_map_botkey.has(key)){
        fin('error',key,'exist');
    }
    else{
        data_map_botkey.set(key,stat);
        fin('insert',key,'');
    }
}
function updateBotID(key,stat,fin){
    var pre_stat='';
    if(!data_map_botkey.has(key)){
        fin('error',key,'','','not exist');
    }
    else{
        pre_stat= data_map_botkey.get(key);
        data_map_botkey.set(key,stat);
        fin('update',key,stat,pre_stat,'');
    }
}
function deleteBotID(key,fin){
    var key_stat='';
    if(!data_map_botkey.has(key)){
        fin('error',key,key_stat,'not exist');
    }
    else{
        key_stat = data_map_botkey.get(key);
        data_map_botkey.remove(key);
        fin('delete',key,key_stat,'');
    }
}
function clearAllBotID(){
    data_map_botkey.clear();
}
function searchBotID(key,fin){
    var key_stat='';
    if(!data_map_botkey.has(key)){
        fin('error',key,key_stat,'not exist');
    }
    else{
        key_stat = data_map_botkey.get(key);
        fin('search',key,key_stat,'');
    }
}
function listAllBotID(fin){
    var keys;
    var key,value;
    var list=[];
    var i;
    keys=data_map_botkey.keys();
    for(i=0;i<keys.length;i++){
        key = keys[i];
        value = data_map_botkey.get(keys[i]);
        list.push({id:key,status:value});
    }
    fin(list);
}
function sendResponse(res,code,action,stat,msg,err_msg){
    var result=JSON.stringify({action:action,status:stat,data:msg,error:err_msg},null,3);
    res.status(code).send(result);
}
