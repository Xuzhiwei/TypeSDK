/**
 * Created by TypeSDK on 2017/1/7.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');

function convertParamLogin(query,ret)
{
    var org =
    {
        "id" : "0"
        ,"token": ""
        ,"data":""
        ,"sign":""
    };

    var cloned = merge(true, org);
    merge(cloned,query);

    for(var i in cloned)
    {
        //判断参数中是否该有的字段齐全
        if(org[i] == cloned[i] && i != "data" && i != "id")
        {
            return false;
        }

        //判断参数中是否有为空的字段
        if(0 == (cloned[i] + "").replace(/(^s*)|(s*$)/g, "").length && i != "data" && i != "id")
        {
            return false;
        }
    }

    ret.token = cloned.token;

    return true;
}



function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.pid = attrs.app_id;


    var options = {
        url: params.out_url,
        method: "POST",
        qs: cloned
    };

    console.log('Option: ' + JSON.stringify(options));

    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);

    //console.log(options);
    request(options, function (error, response, body) {
        console.log('HTTP Error: ' + JSON.stringify(error));
        console.log('HTTP Body: ' + JSON.stringify(body));
        if (!error && response.statusCode == 200) {
            var retOut = JSON.parse(body);
            if(retOut.code == '100'){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = retOut.data;
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
            else
            {
                //打点：验证失败
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);

                ret.code =  1;
                ret.msg = "LOGIN User ERROR";
                ret.id = "";
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
        }
        else
        {
            //打点：验证失败 
            logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);

            ret.code =  2; 
            ret.msg = "OUT URL ERROR";
            ret.value = "";
         }
        retf(ret);
    });
}

function compareOrder(attrs,gattrs,params,query,ret,game,channel,retf){
    var retValue = {};
    retValue.code = 0;
    retValue.id = query.extra.split('|')[0];
    retValue.order = query.orderId;
    retValue.cporder = query.extra.split('|')[1];
    retValue.info = '';
    var ret = {code: 101, data: '失败', msg: ''};

    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retf(ret);
            return;
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,1,query);
            var options = {
                url: params.verifyurl,
                method: "POST",
                body: retValue,
                json: true
            };
            console.log('Compare Options: ' + JSON.stringify(options));

            request(options, function (error, response, body) {
                console.log('HTTP Error: ' + JSON.stringify(error));
                console.log('HTTP Body: ' + JSON.stringify(body));

                if(!error && response.statusCode == 200){
                    var retOut = body;
                    if (typeof retOut.code == 'undefined'){
                        retf(ret);
                        return;
                    }
                    if(retOut.code=='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(retValue.id  == retOut.id
                            && retValue.cporder == retOut.cporder
                            && query.amount * 100 >= retOut.amount * 0.9
                            && query.amount * 100 <= retOut.amount ){
                            if(retOut.status=='2'){
                                retf(ret);
                                return;
                            }else if(retOut.status=='4'||retOut.status=='3'){
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount * 100);
                                ret.code = 100;
                                ret.data = '成功';
                                retf(ret);
                                return;
                            }else{
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,2,0);
                                var data  = {};
                                data.code = '0000';
                                data.msg = 'NORMAL';
                                retf(data);
                                return;
                            }
                        }else{
                            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,3,0);
                            retf(ret);
                            return;
                        }
                    }else{
                        retf(ret);
                        return;
                    }
                }else{
                    retf(ret);
                    return;
                }
            });
        }
    });
}

function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    var retValue = {};
    retValue.code = 0;
    retValue.id = query.extra.split('|')[0];
    retValue.order = query.orderId;
    retValue.cporder = query.extra.split('|')[1];
    retValue.info = '';

    var ret = {code: 101, data: '失败', msg: ''};

    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData){
        if(!hasData)
        {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf(ret);
        }else{
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);

            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
            retValue.amount = query.amount * 100 + '';


            var options = {
                url: params.out_url,
                method: params.method,
                body: retValue,
                json: true
            };
            console.log('Pay Options: ' + JSON.stringify(options));

            //打点：支付回调通知
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PayNotice);
            request(options, function (error, response, body) {
                console.log('HTTP Error: ' + JSON.stringify(error));
                console.log('HTTP Body: ' + JSON.stringify(body));
                if (!error && response.statusCode == 200) {
                    var retOut = body;

                    if (typeof retOut.code == 'undefined'){
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf(ret);
                    }

                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);
                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount * 100);
                        ret.code = 100;
                        ret.data = '成功';
                        retf(ret);
                    }
                    else {
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf(ret);
                    }
                }else
                {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                    retf(ret);
                }
            });
        }
    });
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var isIllegal = false;
    logicCommon.selCHOrderInRedis(game, channel,query.oid,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.doid, query.oid,function(res){
                if(res && typeof res != "undefined"){
                    isIllegal = true;
                    retf(isIllegal);
                }else{
                    retf(isIllegal);
                }
            });
        }else{
            retf(isIllegal);
        }
    });
}

function checkSignPay(attrs,query)
{
    var str = query.orderId + query.userNo
        + query.amount + query.extra + attrs.secret_key;

    var osign = crypto.createHash('md5').update(str).digest('hex').toUpperCase();

    console.log(query.flag + " :: " + osign);

    if (query.flag != osign)
    {
        return false;
    }

    return true;
}


function checkOrder()
{
    return false;
}


function CreateChannelOrder(attrs,params,query,ret,retf){}

exports.convertParamLogin = convertParamLogin;
exports.callChannelLogin = callChannelLogin;
exports.checkSignPay = checkSignPay;
exports.callGamePay = callGamePay;
exports.checkOrder = checkOrder;

exports.CreateChannelOrder = CreateChannelOrder;
exports.compareOrder= compareOrder;
exports.checkChOrder = checkChOrder;