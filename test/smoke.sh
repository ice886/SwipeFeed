#!/usr/bin/env bash
# 全链路冒烟测试：用法 `bash test/smoke.sh`（需先启动后端 API + Worker + MySQL/Redis/RabbitMQ）
# 覆盖：注册/登录/refresh/上传/发布/五种 Feed/点赞/评论/关注/关注流推拉结合/私信/通知/SSE/分片断点续传/改名/登出
# 测试时间：注册→登录→上传→发布→Feed→点赞→评论→关注→私信→通知→SSE→分片→改名→登出
set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR
API=${API:-http://127.0.0.1:8080}
export API
PASS=0; FAIL=0
check() { # name, expected_substr, actual
  if [[ "$3" == *"$2"* ]]; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "FAIL $1 -> $2"; fi
}

# 清掉历史限流计数（注册 5次/时/IP，多次冒烟会触发自身限流）
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T redis \
  sh -c "redis-cli -a 123456 --no-auth-warning --scan --pattern 'feedsystem:ratelimit:*' | xargs -r redis-cli -a 123456 --no-auth-warning del" >/dev/null 2>&1

check healthz '"status":"ok"' "$(curl -s $API/healthz)"

U="u$RANDOM"; V="v$RANDOM"
check register "account created" "$(curl -s -X POST $API/account/register -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"pass123\"}")"
check register2 "account created" "$(curl -s -X POST $API/account/register -H 'Content-Type: application/json' -d "{\"username\":\"$V\",\"password\":\"pass123\"}")"
check dup_register "already taken" "$(curl -s -X POST $API/account/register -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"pass123\"}")"
check bad_login "invalid" "$(curl -s -X POST $API/account/login -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"wrong\"}")"

LOGIN=$(curl -s -X POST $API/account/login -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"pass123\"}")
check login '"token"' "$LOGIN"
TOKEN=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
REFRESH=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["refresh_token"])')
AID=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["account_id"])')
LOGIN2=$(curl -s -X POST $API/account/login -H 'Content-Type: application/json' -d "{\"username\":\"$V\",\"password\":\"pass123\"}")
TOKEN2=$(echo "$LOGIN2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
BID=$(echo "$LOGIN2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["account_id"])')
AUTH="Authorization: Bearer $TOKEN"; AUTH2="Authorization: Bearer $TOKEN2"
export TOKEN TOKEN2

REFRESH_RESP=$(curl -s -X POST $API/account/refresh -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$REFRESH\"}")
check refresh '"token"' "$REFRESH_RESP"
# refresh 会轮换服务端 access token（旧 token 立即撤销）：后续请求改用新 token
TOKEN=$(echo "$REFRESH_RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"

# 上传视频 + 封面
head -c 200000 /dev/urandom > /tmp/smoke.mp4
UP=$(curl -s -X POST $API/video/uploadVideo -H "$AUTH" -F "file=@/tmp/smoke.mp4;filename=smoke.mp4;type=video/mp4")
check upload_video '"play_url"' "$UP"
PLAY_URL=$(echo "$UP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["play_url"])')
python3 -c "
import zlib,struct
def png(w,h):
    def chunk(t,d):
        c=t+d
        return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    raw=b''.join(b'\x00'+b'\xff\x00\x00'*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open('/tmp/smoke.png','wb').write(png(4,4))
"
COVER=$(curl -s -X POST $API/video/uploadCover -H "$AUTH" -F "file=@/tmp/smoke.png;filename=cover.png;type=image/png")
check upload_cover '"cover_url"' "$COVER"
COVER_URL=$(echo "$COVER" | python3 -c 'import json,sys; print(json.load(sys.stdin)["cover_url"])')

PUB=$(curl -s -X POST $API/video/publish -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"smoke test #smoketag\",\"description\":\"hello #smoketag\",\"play_url\":\"$PLAY_URL\",\"cover_url\":\"$COVER_URL\"}")
check publish '"id"' "$PUB"
VID=$(echo "$PUB" | python3 -c 'import json,sys; print(json.load(sys.stdin)["video"]["id"])')

check detail "\"id\":$VID" "$(curl -s -X POST $API/video/getDetail -H 'Content-Type: application/json' -d "{\"id\":$VID}")"
check list_by_author "\"id\":$VID" "$(curl -s -X POST $API/video/listByAuthorID -H 'Content-Type: application/json' -d "{\"author_id\":$AID}")"

# Feed（outbox→MQ→timeline 异步，等 2s）
sleep 2
check feed_latest "\"id\":$VID" "$(curl -s -X POST $API/feed/listLatest -H "$AUTH" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')"
check feed_tag "\"id\":$VID" "$(curl -s -X POST $API/feed/listByTag -H 'Content-Type: application/json' -d '{"tag_name":"smoketag","limit":10}')"

# 点赞：B 点赞 A 的视频（触发 A 的 like 通知）；A 自赞不产生通知
check like '"message"' "$(curl -s -X POST $API/like/like -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"video_id\":$VID}")"
check self_like '"message"' "$(curl -s -X POST $API/like/like -H "$AUTH" -H 'Content-Type: application/json' -d "{\"video_id\":$VID}")"
sleep 2
check is_liked '"is_liked":true' "$(curl -s -X POST $API/like/isLiked -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"video_id\":$VID}")"
check likes_count_async '"likes_count":2' "$(curl -s -X POST $API/video/getDetail -H 'Content-Type: application/json' -d "{\"id\":$VID}")"
check my_liked "\"id\":$VID" "$(curl -s -X POST $API/like/listMyLikedVideos -H "$AUTH2" -H 'Content-Type: application/json' -d '{}')"
check feed_likes_rank "\"id\":$VID" "$(curl -s -X POST $API/feed/listLikesCount -H 'Content-Type: application/json' -d '{"limit":10}')"
check feed_popularity "\"id\":$VID" "$(curl -s -X POST $API/feed/listByPopularity -H 'Content-Type: application/json' -d '{"limit":10,"offset":0}')"
check unlike '"message"' "$(curl -s -X POST $API/like/unlike -H "$AUTH" -H 'Content-Type: application/json' -d "{\"video_id\":$VID}")"

# 评论 + 提及（A 评论并 @V）
check comment '"message"' "$(curl -s -X POST $API/comment/publish -H "$AUTH" -H 'Content-Type: application/json' -d "{\"video_id\":$VID,\"content\":\"nice @${V} #smoketag\"}")"
sleep 2
COMMENTS=$(curl -s -X POST $API/comment/listAll -H 'Content-Type: application/json' -d "{\"video_id\":$VID}")
check comment_list "nice" "$COMMENTS"
CID=$(echo "$COMMENTS" | python3 -c 'import json,sys; cs=json.load(sys.stdin)["comments"]; print(cs[0]["id"] if cs else 0)')
check comment_delete_forbidden 'only the comment author' "$(curl -s -X POST $API/comment/delete -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"comment_id\":$CID}")"
check comment_delete '"message"' "$(curl -s -X POST $API/comment/delete -H "$AUTH" -H 'Content-Type: application/json' -d "{\"comment_id\":$CID}")"

# 关注：B 关注 A
check follow '"message"' "$(curl -s -X POST $API/social/follow -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"vlogger_id\":$AID}")"
sleep 2
check counts "\"vlogger_count\":1" "$(curl -s -X POST $API/social/getCounts -H "$AUTH2" -H 'Content-Type: application/json' -d '{}')"
check followers "\"id\":$BID" "$(curl -s -X POST $API/social/getAllFollowers -H "$AUTH" -H 'Content-Type: application/json' -d '{}')"
check following_feed "\"id\":$VID" "$(curl -s -X POST $API/feed/listByFollowing -H "$AUTH2" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')"

# —— 关注流推拉结合（收件箱推 + 大V发件箱拉 + 读取归并）——
RCLI() { docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T redis sh -c "redis-cli -a 123456 --no-auth-warning $*"; }
# 推路径：A 当前 1 粉丝（普通作者），发布后写入 B 的收件箱
PUB2=$(curl -s -X POST $API/video/publish -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"push path\",\"description\":\"\",\"play_url\":\"$PLAY_URL\",\"cover_url\":\"$COVER_URL\"}")
check publish_push '"id"' "$PUB2"
VID2=$(echo "$PUB2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["video"]["id"])')
sleep 2
check following_push "\"id\":$VID2" "$(curl -s -X POST $API/feed/listByFollowing -H "$AUTH2" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')"
check inbox_pushed "2" "$(RCLI ZCARD feed:following:inbox:v1:$BID)"

# 拉路径：阈值下调为 2，C 关注 A 后 A 达到大V，新视频只写发件箱、读取侧拉取
RCLI SET config:fanout_threshold 2 >/dev/null
W="w$RANDOM"
check register3 "account created" "$(curl -s -X POST $API/account/register -H 'Content-Type: application/json' -d "{\"username\":\"$W\",\"password\":\"pass123\"}")"
LOGIN3=$(curl -s -X POST $API/account/login -H 'Content-Type: application/json' -d "{\"username\":\"$W\",\"password\":\"pass123\"}")
TOKEN3=$(echo "$LOGIN3" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
AUTH3="Authorization: Bearer $TOKEN3"
check follow3 '"message"' "$(curl -s -X POST $API/social/follow -H "$AUTH3" -H 'Content-Type: application/json' -d "{\"vlogger_id\":$AID}")"
sleep 2
PUB3=$(curl -s -X POST $API/video/publish -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"pull path\",\"description\":\"\",\"play_url\":\"$PLAY_URL\",\"cover_url\":\"$COVER_URL\"}")
check publish_pull '"id"' "$PUB3"
VID3=$(echo "$PUB3" | python3 -c 'import json,sys; print(json.load(sys.stdin)["video"]["id"])')
sleep 2
check outbox_bigv "1" "$(RCLI ZCARD feed:following:author:v1:$AID)"
check following_pull "\"id\":$VID3" "$(curl -s -X POST $API/feed/listByFollowing -H "$AUTH2" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')"
FOLLOWING_C=$(curl -s -X POST $API/feed/listByFollowing -H "$AUTH3" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')
check following_pull_c "\"id\":$VID3" "$FOLLOWING_C"
check following_backfill_c "\"id\":$VID2" "$FOLLOWING_C"

# 取关：B 取关 A 后收件箱清理 + 发件箱不再拉取，关注流应为空
check unfollow '"message"' "$(curl -s -X POST $API/social/unfollow -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"vlogger_id\":$AID}")"
check following_unfollow '"video_list":[]' "$(curl -s -X POST $API/feed/listByFollowing -H "$AUTH2" -H 'Content-Type: application/json' -d '{"limit":10,"latest_time":0}')"
RCLI DEL config:fanout_threshold >/dev/null

# 私信：A -> B
check message_send '"id"' "$(curl -s -X POST $API/message/send -H "$AUTH" -H 'Content-Type: application/json' -d "{\"to_id\":$BID,\"content\":\"hello smoke\"}")"
check message_list "hello smoke" "$(curl -s -X POST $API/message/list -H "$AUTH2" -H 'Content-Type: application/json' -d "{\"peer_id\":$AID}")"

# 通知：A 收到 like + follow；B 收到 mention
NOTIF_A=$(curl -s -X POST $API/notification/list -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
NOTIF_B=$(curl -s -X POST $API/notification/list -H "$AUTH2" -H 'Content-Type: application/json' -d '{}')
check notif_like 'liked your video' "$NOTIF_A"
check notif_follow 'followed you' "$NOTIF_A"
check notif_mention 'mentioned you' "$NOTIF_B"
check unread '"count":' "$(curl -s -X POST $API/notification/unreadCount -H "$AUTH2" -H 'Content-Type: application/json' -d '{}')"
check mark_read '"message"' "$(curl -s -X POST $API/notification/markRead -H "$AUTH2" -H 'Content-Type: application/json' -d '{}')"

# SSE 流：建立连接收到 connected 注释
check sse_stream ': connected' "$(curl -s -m 2 -N "$API/notification/stream?token=$TOKEN2" | head -1)"

# 分片上传（3 分片 + 断点续传 + 错误 hash 校验）
head -c 12000000 /dev/urandom > /tmp/chunked.mp4
python3 - <<'PYEOF'
import hashlib, json, subprocess, os
data = open('/tmp/chunked.mp4','rb').read()
chunk_size = 5*1024*1024
chunks = [data[i:i+chunk_size] for i in range(0, len(data), chunk_size)]
file_hash = hashlib.md5(data).hexdigest()
tok = os.environ['TOKEN']
api = os.environ.get('API', 'http://127.0.0.1:8080')
def post(path, body):
    r = subprocess.run(['curl','-s','-X','POST',f'{api}{path}','-H',f'Authorization: Bearer {tok}',
        '-H','Content-Type: application/json','-d',json.dumps(body)],capture_output=True,text=True)
    return json.loads(r.stdout)
init = post('/video/chunk/init', {'filename':'big.mp4','file_size':len(data),'chunk_size':chunk_size,
    'total_chunks':len(chunks),'file_hash':file_hash})
assert 'upload_id' in init, init
uid = init['upload_id']
# 断点续传：同 hash 再 init 应复用会话
init2 = post('/video/chunk/init', {'filename':'big.mp4','file_size':len(data),'chunk_size':chunk_size,
    'total_chunks':len(chunks),'file_hash':file_hash})
assert init2['upload_id'] == uid, (init, init2)
for i,c in enumerate(chunks):
    open(f'/tmp/part{i}','wb').write(c)
    h = hashlib.md5(c).hexdigest()
    rr = subprocess.run(['curl','-s','-X','POST',f'{api}/video/chunk/upload','-H',f'Authorization: Bearer {tok}',
      '-F',f'upload_id={uid}','-F',f'chunk_index={i}','-F',f'chunk_hash={h}',
      '-F',f'file=@/tmp/part{i};filename=part{i}'],capture_output=True,text=True)
    assert '"chunk_index":' in rr.stdout, rr.stdout
status = post('/video/chunk/status', {'upload_id':uid})
assert sorted(status['uploaded_chunks']) == list(range(len(chunks))), status
done = post('/video/chunk/complete', {'upload_id':uid})
assert 'play_url' in done, done
merged = os.environ.get('UPLOAD_DIR', os.path.join(os.environ['ROOT_DIR'], 'backend/.run/uploads')) + done['play_url'].replace('/static','')
assert os.path.getsize(merged) == len(data), (os.path.getsize(merged), len(data))
# 错误会话应报错
bad = subprocess.run(['curl','-s','-X','POST',f'{api}/video/chunk/upload','-H',f'Authorization: Bearer {tok}',
  '-F','upload_id=nope','-F','chunk_index=0','-F','chunk_hash=x','-F','file=@/tmp/part0;filename=p'],capture_output=True,text=True)
assert 'error' in bad.stdout, bad.stdout
print('CHUNK_UPLOAD_OK', done['play_url'])
PYEOF
if [[ $? -eq 0 ]]; then PASS=$((PASS+1)); echo "ok   chunk_upload"; else FAIL=$((FAIL+1)); echo "FAIL chunk_upload"; fi

# 静态文件
check static_file '200' "$(curl -s -o /dev/null -w '%{http_code}' $API$PLAY_URL)"

# 改名（旧 token 立即失效，返回新 token）
RENAME=$(curl -s -X POST $API/account/rename -H "$AUTH" -H 'Content-Type: application/json' -d "{\"new_username\":\"${U}renamed\"}")
check rename '"token"' "$RENAME"
check old_token_dead 'invalid or expired' "$(curl -s -X POST $API/account/logout -H "$AUTH" -H 'Content-Type: application/json' -d '{}')"
NEWTOKEN=$(echo "$RENAME" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
check new_token_works '"video_count":3' "$(curl -s -X POST $API/account/getProfile -H "Authorization: Bearer $NEWTOKEN" -H 'Content-Type: application/json' -d "{\"account_id\":$AID}")"
check logout '"message"' "$(curl -s -X POST $API/account/logout -H "Authorization: Bearer $NEWTOKEN" -H 'Content-Type: application/json' -d '{}')"
check logout_invalid 'invalid or expired' "$(curl -s -X POST $API/account/logout -H "Authorization: Bearer $NEWTOKEN" -H 'Content-Type: application/json' -d '{}')"

echo
echo "==== smoke result: pass=$PASS fail=$FAIL ===="
