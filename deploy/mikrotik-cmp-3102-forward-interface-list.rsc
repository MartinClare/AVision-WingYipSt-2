# MikroTik RouterOS — CMP 3102 forward using WAN interface list (preferred if you use interface lists)
# Target: 192.168.10.148:3102

:local publicPort 3102
:local cmpIp "192.168.10.148"
:local cmpPort 3102
:local ruleComment "AVision Central CMP 3102"

/ip firewall nat remove [find comment=$ruleComment]
/ip firewall filter remove [find comment=$ruleComment]

/ip firewall nat add \
    chain=dstnat \
    in-interface-list=WAN \
    protocol=tcp \
    dst-port=$publicPort \
    action=dst-nat \
    to-addresses=$cmpIp \
    to-ports=$cmpPort \
    comment=$ruleComment

/ip firewall filter add \
    chain=forward \
    action=accept \
    connection-state=new \
    protocol=tcp \
    dst-address=$cmpIp \
    dst-port=$cmpPort \
    comment=$ruleComment \
    place-before=0

:put "Done. Test from mobile data: http://wingyip.axoncase.com:3102/"
