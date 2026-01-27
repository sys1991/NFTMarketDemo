# 项目初始化

## 初始化npm环境

```shell
npm init -y
```

## 安装hardhat

```shell
npm install --save-dev hardhat@latest
```

## 初始化hardhat

```shell
npx hardhat --init
```

## 单元测试
```shell
npx hardhat test test/MyNFTToken.ts --coverage  

# --coverage 测试覆盖率报告
# --grep xxx 只测试某一个describe
```

## 本地部署
```shell
# 启动本地节点
npx hardhat node

# 部署到指定网络
npx hardhat run scripts/deployNFTToken.ts --network localhost

npx hardhat run scripts/deployMockUsdc.ts --network localhost
```

## 单元测试报告
![alt text](image.png)
