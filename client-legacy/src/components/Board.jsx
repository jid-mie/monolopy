import React from "react"
import Square from "./Square"
import PlayerStats from "./PlayerStats"
import PropertyStats from "./PropertyStats"
import Buy from "./Buy"
import Escape from "./Escape"
import Dice from "./Dice"
import End from "./End"
// import {Grid, board-Row, div} from "react-bootstrap"

class Board extends React.Component{

  constructor(props){
    super(props)
    this.state = {
     
    }
  }

  getPlayerPositions(){
   return this.props.players.map(function(player){
    return player.position
  })
 }

 filterPositions(playerPositions,index) {return this.props.players.filter((player,filterIndex)=>{
  return this.props.players.indexOf(player) === playerPositions.map((position,positionIndex) => {
    return positionIndex === filterIndex ? position : null
  }).indexOf(index)
})}

 render(){
  const p = this.props

  const squareNodes = p.squares.map((array, index)=>{


    const playerPositions = this.getPlayerPositions()

    const playersArray = playerPositions.includes(index) ? this.filterPositions(playerPositions,index) : null

    return(
      <Square 
      key = {index}
      index = {index} 
      value={p.squares[index]}
      id =  {"cell" + p.squares[index]}
      players={playersArray}
      />
      )
  })

  // return(
  //   <div className="board">
  //   {squareNodes}
  //   </div>
  //   )

  return(
    <div className="board">
      <div className="board-row">
        <div >{squareNodes[0]}</div>
        <div >{squareNodes[1]}</div>
        <div >{squareNodes[2]}</div>
        <div >{squareNodes[3]}</div>
        <div >{squareNodes[4]}</div>
        <div >{squareNodes[5]}</div>
        <div >{squareNodes[6]}</div>
        <div >{squareNodes[7]}</div>
        <div >{squareNodes[8]}</div>
        <div >{squareNodes[9]}</div> 
        <div >{squareNodes[10]}</div>
      </div>
      <div className="board-row">
        <div>{squareNodes[39]}</div>
        <div className="box inner filler-large"></div>
        <div>{squareNodes[11]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[38]}</div>
        <div className="box inner filler-small"></div>
        <div className="box inner content-large"><PropertyStats property={p.property}/></div>
        <div className="box inner filler-medium"></div>
        <div>{squareNodes[12]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[37]}</div>
        <div className="box inner filler-small"></div>
        <div className="box inner content-small"><Buy handleClick={p.purchaseClick} disabled={!p.player} /></div>
        <div className="box inner filler-medium"></div>
        <div className="box inner content-small"><Escape handleClick={p.escapeClick} disabled={!p.player} /></div>
        <div className="box inner filler-medium"></div>
        <div>{squareNodes[13]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[36]}</div>
        <div className="box inner filler-small"></div>
        <div className="box inner content-large"><PlayerStats player={p.player}/></div>
        <div className="box inner filler-medium"></div>
        <div>{squareNodes[14]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[35]}</div>
        <div className="box inner filler-large"></div>
        <div>{squareNodes[15]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[34]}</div>
        <div className="box inner filler-small"></div>
        <div className="box inner content-medium">
          <Dice 
            moveValue={p.moveValue} 
            setMoveValue={p.setMoveValue}
            updatePlayerPosition={p.updatePlayerPosition}
            rolled={p.rolled}
            won={p.won}
            updateRolled={p.updateRolled}
            disabled={!p.player}/>
        </div>
        <div className="box inner filler-small"></div> 
        <div className="box inner content-small"><End updateActivePlayer={p.updateActivePlayer} disabled={!p.player} /></div>
        <div className="box inner filler-medium"></div>
        <div>{squareNodes[16]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[33]}</div>
        <div className="box inner filler-large"></div>
        <div>{squareNodes[17]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[32]}</div>
        <div className="box inner filler-large"></div>
        <div>{squareNodes[18]}</div>
      </div>      
      <div className="board-row">
        <div>{squareNodes[31]}</div>
        <div className="box inner filler-large"></div>
        <div>{squareNodes[19]}</div>
      </div>
      <div className="board-row">
        <div>{squareNodes[30]}</div>
        <div>{squareNodes[29]}</div>
        <div>{squareNodes[28]}</div>
        <div>{squareNodes[27]}</div>
        <div>{squareNodes[26]}</div>
        <div>{squareNodes[25]}</div>
        <div>{squareNodes[24]}</div>
        <div>{squareNodes[23]}</div>
        <div>{squareNodes[22]}</div>
        <div>{squareNodes[21]}</div>
        <div>{squareNodes[20]}</div>
      </div>
    </div>
  )
}

}

export default Board
